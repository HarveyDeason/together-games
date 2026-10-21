"""Local development server.

`python -m http.server` sends no cache headers at all, so browsers apply
heuristic freshness and happily serve a stale ES module after you have edited
it — which looks exactly like your code not working. This adds no-store so a
reload always fetches the current file.

Development only. GitHub Pages serves the real site and sets its own headers.

    python devserver.py [port]
"""

import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

DEFAULT_PORT = 5070


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Quieter than the default: one line per request, no timestamp noise.
        sys.stderr.write("%s\n" % (fmt % args))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    # Serve this file's own directory, not the caller's cwd, so it works
    # whichever folder the launcher happens to start it from.
    root = os.path.dirname(os.path.abspath(__file__))
    handler = partial(NoCacheHandler, directory=root)
    with ThreadingHTTPServer(("", port), handler) as httpd:
        print(f"Serving {root} at http://localhost:{port}/ with caching disabled")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
