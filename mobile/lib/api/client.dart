import 'dart:convert';
import 'dart:io';

import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio/dio.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:path_provider/path_provider.dart';

const String kBaseUrl = 'https://erp2.v12infotech.com';
const String kAppPath = '/ignition';

/// Thrown with the human-readable message Frappe put in _server_messages.
class FrappeException implements Exception {
  FrappeException(this.message, {this.statusCode});
  final String message;
  final int? statusCode;
  @override
  String toString() => message;
}

/// Frappe REST client: persistent cookie session + CSRF handling.
///
/// Cookie-authenticated writes need an X-Frappe-CSRF-Token header. The token
/// isn't exposed by a whitelisted endpoint, but our own /ignition page injects
/// `window.csrf_token = '...'` — so we fetch that page and parse it, and
/// refresh whenever the server reports a CSRF failure.
class ApiClient {
  ApiClient._(this._dio, this._jar);

  final Dio _dio;
  final PersistCookieJar _jar;
  String? _csrfToken;

  static Future<ApiClient> create() async {
    final dir = await getApplicationSupportDirectory();
    final jar = PersistCookieJar(storage: FileStorage('${dir.path}/cookies'));
    final dio = Dio(BaseOptions(
      baseUrl: kBaseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
      headers: {'Accept': 'application/json'},
      // Handle status codes ourselves so we can surface Frappe's messages.
      validateStatus: (_) => true,
    ));
    dio.interceptors.add(CookieManager(jar));
    return ApiClient._(dio, jar);
  }

  // ---------------------------------------------------------------- session
  Future<bool> hasSession() async {
    final res = await _dio.get('/api/method/frappe.auth.get_logged_user');
    return res.statusCode == 200;
  }

  Future<String> loggedUser() async {
    final res = await _dio.get('/api/method/frappe.auth.get_logged_user');
    _ensureOk(res);
    return res.data['message'] as String;
  }

  Future<void> login(String user, String password) async {
    final res = await _dio.post('/api/method/login',
        data: {'usr': user, 'pwd': password},
        options: Options(contentType: Headers.jsonContentType));
    if (res.statusCode != 200) {
      throw FrappeException(_messageFrom(res) ?? 'Invalid login', statusCode: res.statusCode);
    }
    _csrfToken = null; // new session, new token
  }

  Future<void> logout() async {
    await _dio.get('/api/method/logout');
    await _jar.deleteAll();
    _csrfToken = null;
  }

  Future<void> _fetchCsrf() async {
    final res = await _dio.get(kAppPath,
        options: Options(headers: {'Accept': 'text/html'}, responseType: ResponseType.plain));
    final match = RegExp("window.csrf_token = '([^']+)'").firstMatch(res.data as String? ?? '');
    _csrfToken = match?.group(1);
  }

  // ---------------------------------------------------------------- plumbing
  String? _messageFrom(Response res) {
    try {
      final data = res.data is String ? jsonDecode(res.data as String) : res.data;
      if (data is Map) {
        final sm = data['_server_messages'];
        if (sm is String && sm.isNotEmpty) {
          final list = jsonDecode(sm) as List;
          if (list.isNotEmpty) {
            final first = jsonDecode(list.first as String) as Map;
            final msg = (first['message'] as String?) ?? '';
            if (msg.isNotEmpty) return msg.replaceAll(RegExp(r'<[^>]+>'), '');
          }
        }
        final exc = data['exception'] as String?;
        if (exc != null && exc.contains(':')) {
          return exc.split(':').sublist(1).join(':').trim();
        }
      }
    } catch (_) {}
    return null;
  }

  void _ensureOk(Response res) {
    final code = res.statusCode ?? 0;
    if (code >= 200 && code < 300) return;
    if (code == 401 || code == 403) {
      final msg = _messageFrom(res) ?? '';
      if (msg.toLowerCase().contains('csrf')) {
        throw FrappeException('csrf', statusCode: code);
      }
      throw FrappeException(msg.isEmpty ? 'Not permitted — log in again' : msg, statusCode: code);
    }
    throw FrappeException(_messageFrom(res) ?? 'Request failed ($code)', statusCode: code);
  }

  Future<Response> _write(String method, String path, Object? data) async {
    if (_csrfToken == null) await _fetchCsrf();
    Future<Response> send() => _dio.request(path,
        data: data,
        options: Options(
          method: method,
          contentType: Headers.jsonContentType,
          headers: {'X-Frappe-CSRF-Token': _csrfToken ?? ''},
        ));
    var res = await send();
    // Stale token (server restart, new session): refresh once and retry.
    if ((res.statusCode == 400 || res.statusCode == 403) &&
        (_messageFrom(res) ?? '').toLowerCase().contains('csrf')) {
      await _fetchCsrf();
      res = await send();
    }
    _ensureOk(res);
    return res;
  }

  // ---------------------------------------------------------------- REST api
  Future<List<Map<String, dynamic>>> getList(
    String doctype, {
    required List<String> fields,
    List<List<Object?>>? filters,
    String? orderBy,
    int limit = 200,
  }) async {
    final res = await _dio.get('/api/resource/$doctype', queryParameters: {
      'fields': jsonEncode(fields),
      if (filters != null) 'filters': jsonEncode(filters),
      if (orderBy != null) 'order_by': orderBy,
      'limit_page_length': '$limit',
    });
    _ensureOk(res);
    return (res.data['data'] as List).cast<Map<String, dynamic>>();
  }

  Future<Map<String, dynamic>> getDoc(String doctype, String name) async {
    final res = await _dio.get('/api/resource/$doctype/${Uri.encodeComponent(name)}');
    _ensureOk(res);
    return (res.data['data'] as Map).cast<String, dynamic>();
  }

  Future<Map<String, dynamic>> createDoc(String doctype, Map<String, Object?> values) async {
    final res = await _write('POST', '/api/resource/$doctype', values);
    return (res.data['data'] as Map).cast<String, dynamic>();
  }

  Future<Map<String, dynamic>> updateDoc(
      String doctype, String name, Map<String, Object?> values) async {
    final res =
        await _write('PUT', '/api/resource/$doctype/${Uri.encodeComponent(name)}', values);
    return (res.data['data'] as Map).cast<String, dynamic>();
  }

  Future<void> deleteDoc(String doctype, String name) async {
    await _write('DELETE', '/api/resource/$doctype/${Uri.encodeComponent(name)}', null);
  }

  /// Upload a file and attach it to a document (Frappe's upload_file handler).
  Future<Map<String, dynamic>> uploadFile({
    required String filePath,
    required String fileName,
    required String doctype,
    required String docname,
    bool isPrivate = true,
  }) async {
    if (_csrfToken == null) await _fetchCsrf();
    Future<Response> send() async => _dio.post(
          '/api/method/upload_file',
          data: FormData.fromMap({
            'file': await MultipartFile.fromFile(filePath, filename: fileName),
            'doctype': doctype,
            'docname': docname,
            'is_private': isPrivate ? '1' : '0',
          }),
          options: Options(headers: {'X-Frappe-CSRF-Token': _csrfToken ?? ''}),
        );
    var res = await send();
    if ((res.statusCode == 400 || res.statusCode == 403) &&
        (_messageFrom(res) ?? '').toLowerCase().contains('csrf')) {
      await _fetchCsrf();
      res = await send();
    }
    _ensureOk(res);
    return (res.data['message'] as Map).cast<String, dynamic>();
  }

  /// Download a (possibly private) file using the session cookies.
  Future<void> downloadFile(String fileUrl, String savePath) async {
    final res = await _dio.get<List<int>>(fileUrl,
        options: Options(responseType: ResponseType.bytes));
    _ensureOk(res);
    await File(savePath).writeAsBytes(res.data!);
  }

  Future<dynamic> call(String method, {Map<String, Object?>? args, bool post = false}) async {
    final Response res;
    if (post) {
      res = await _write('POST', '/api/method/$method', args ?? {});
    } else {
      res = await _dio.get('/api/method/$method', queryParameters: args);
      _ensureOk(res);
    }
    return res.data['message'];
  }
}
