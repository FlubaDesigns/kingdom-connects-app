#!/usr/bin/env python3
import http.server
import socketserver
import os
import json
import urllib.request
import urllib.error
from functools import partial

PORT = 5000
API_SERVER = 'http://127.0.0.1:3000'

class NoCacheHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def proxy_to_api(self, method='GET'):
        """Forward API requests to Node.js server"""
        try:
            url = f"{API_SERVER}{self.path}"
            headers = {}
            
            # Copy relevant headers
            if 'Content-Type' in self.headers:
                headers['Content-Type'] = self.headers['Content-Type']
            if 'Authorization' in self.headers:
                headers['Authorization'] = self.headers['Authorization']
            
            # Read body for POST/PUT
            body = None
            if method in ['POST', 'PUT', 'PATCH']:
                content_length = int(self.headers.get('Content-Length', 0))
                if content_length > 0:
                    body = self.rfile.read(content_length)
            
            req = urllib.request.Request(url, data=body, headers=headers, method=method)
            
            with urllib.request.urlopen(req, timeout=30) as response:
                self.send_response(response.status)
                for header, value in response.getheaders():
                    if header.lower() not in ['transfer-encoding', 'connection']:
                        self.send_header(header, value)
                self.end_headers()
                self.wfile.write(response.read())
                
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            error_body = e.read() if e.fp else b'{"error": "API error"}'
            self.wfile.write(error_body)
        except urllib.error.URLError as e:
            self.send_response(503)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": "API server unavailable"}).encode())
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def do_POST(self):
        if self.path.startswith('/api/'):
            return self.proxy_to_api('POST')
        self.send_response(405)
        self.end_headers()

    def do_GET(self):
        # Proxy API requests to Node.js server
        if self.path.startswith('/api/'):
            return self.proxy_to_api('GET')
        # Proxy presentation view/download to Node.js server
        if self.path.startswith('/presentations/'):
            return self.proxy_to_api('GET')
        # Serve backup download
        if self.path == '/download/backup':
            try:
                self.send_response(200)
                self.send_header('Content-type', 'application/gzip')
                self.send_header('Content-Disposition', 'attachment; filename="kingdom-connects-backup.tar.gz"')
                self.end_headers()
                
                with open('kingdom-connects-backup.tar.gz', 'rb') as f:
                    self.wfile.write(f.read())
                return
            except FileNotFoundError:
                self.send_response(404)
                self.send_header('Content-type', 'text/html')
                self.end_headers()
                self.wfile.write(b'<h1>Backup file not found</h1>')
                return
        
        # Serve Firebase config from environment variable
        if self.path == '/firebase-config.json':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
            self.end_headers()
            
            # Build Firebase config for kingdom-commerce project
            config = {
                "apiKey": "AIzaSyD3Im6F3lWgMbJiA7plsDt_Rp9kCLTr6KU",
                "authDomain": "kingdom-commerce.firebaseapp.com",
                "projectId": "kingdom-commerce",
                "storageBucket": "kingdom-commerce.firebasestorage.app",
                "messagingSenderId": "926457853462",
                "appId": "1:926457853462:web:eba8e9ecb2bb5ff43da737"
            }
            
            self.wfile.write(json.dumps(config).encode())
            return
        
        # Serve regular files with custom 404
        path = self.translate_path(self.path)
        
        # Handle clean URLs like Firebase Hosting (cleanUrls: true)
        # Try multiple variants: .html, underscore<->hyphen conversions
        if not os.path.exists(path) and not self.path.endswith('/'):
            # Strip query string for file lookup
            clean_path = self.path.split('?')[0]
            base_path = self.translate_path(clean_path)
            
            variants_to_try = [
                clean_path + '.html',                              # /foo -> /foo.html
                clean_path.replace('-', '_') + '.html',            # /foo-bar -> /foo_bar.html
                clean_path.replace('_', '-') + '.html',            # /foo_bar -> /foo-bar.html
            ]
            
            for variant in variants_to_try:
                variant_path = self.translate_path(variant)
                if os.path.exists(variant_path):
                    self.path = variant
                    return super().do_GET()
        
        if not os.path.exists(path) or os.path.isdir(path) and not os.path.exists(os.path.join(path, 'index.html')):
            # Check if it's a directory with index.html
            if os.path.isdir(path) and os.path.exists(os.path.join(path, 'index.html')):
                return super().do_GET()
            # Serve custom 404 page
            try:
                self.send_response(404)
                self.send_header('Content-type', 'text/html')
                self.end_headers()
                with open('404.html', 'rb') as f:
                    self.wfile.write(f.read())
                return
            except FileNotFoundError:
                self.send_response(404)
                self.send_header('Content-type', 'text/html')
                self.end_headers()
                self.wfile.write(b'<h1>Page Not Found</h1><p><a href="/">Return to Home</a></p>')
                return
        return super().do_GET()
    
    def end_headers(self):
        if not self.path == '/firebase-config.json':
            # Cache control headers
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
            
            # Security headers - prevent XSS, clickjacking, and other attacks
            csp = (
                "default-src 'self'; "
                "script-src 'self' https://www.gstatic.com https://apis.google.com https://js.stripe.com https://cdn.jsdelivr.net; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data: https:; "
                "font-src 'self'; "
                "connect-src 'self' https://*.firebaseio.com https://*.googleapis.com https://firestore.googleapis.com https://api.stripe.com https://*.cloudfunctions.net; "
                "frame-src 'self' https://js.stripe.com https://hooks.stripe.com; "
                "frame-ancestors 'self' https://*.replit.dev; "
                "base-uri 'self'; "
                "form-action 'self';"
            )
            self.send_header('Content-Security-Policy', csp)
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('X-Frame-Options', 'SAMEORIGIN')
            self.send_header('X-XSS-Protection', '1; mode=block')
            self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
        super().end_headers()

    def log_message(self, format, *args):
        print(f"{self.address_string()} - {format % args}")

class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True

os.chdir(os.path.dirname(os.path.abspath(__file__)))

with ReusableTCPServer(("0.0.0.0", PORT), NoCacheHTTPRequestHandler) as httpd:
    print(f"Server running at http://0.0.0.0:{PORT}/")
    print("Press Ctrl+C to stop the server")
    httpd.serve_forever()
