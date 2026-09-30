#!/usr/bin/env python3
"""Record every sentence the app can say into audio/, for read-aloud.

1. Collect the sentences (the app lists them itself, so they always match what it says):
     python3 tools/make_audio.py serve
   then open http://localhost:8000/?collect in a browser. The page saves tools/voice-lines.json;
   stop the server with Ctrl+C.

2. Record them, with either engine:
     python3 tools/make_audio.py build --engine google --voice nl-NL-Wavenet-B
         (needs GOOGLE_TTS_KEY in the environment; the key never goes into the project)
     python3 tools/make_audio.py build --engine say --voice Xander
         (the Mac's own voices, free, no account)
   List the Google Dutch voices with:  python3 tools/make_audio.py voices

Only new or changed sentences are recorded again. audio/index.json maps sentence -> file.
Then bump CACHE in sw.js and push.
"""
import argparse, base64, hashlib, http.server, json, os, pathlib, subprocess, sys, tempfile, urllib.request

root = pathlib.Path(__file__).resolve().parent.parent
audio = root / 'audio'
lines_file = root / 'tools' / 'voice-lines.json'
GOOGLE = 'https://texttospeech.googleapis.com/v1'


def google_key():
    key = os.environ.get('GOOGLE_TTS_KEY')
    if not key:
        sys.exit('GOOGLE_TTS_KEY is not set (see README: read-aloud).')
    return key


def serve(port):
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=str(root), **k)

        def do_POST(self):
            if self.path.rstrip('/').endswith('voice-lines'):
                body = self.rfile.read(int(self.headers['Content-Length']))
                lines = json.loads(body)
                lines_file.write_text(json.dumps(lines, ensure_ascii=False, indent=1) + '\n')
                print(f'saved {len(lines)} sentences to {lines_file.relative_to(root)}')
                self.send_response(204)
                self.end_headers()
            else:
                self.send_error(404)

    print(f'open http://localhost:{port}/?collect  (Ctrl+C to stop)')
    http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()


def voices():
    url = f'{GOOGLE}/voices?languageCode=nl-NL&key={google_key()}'
    for v in json.load(urllib.request.urlopen(url))['voices']:
        print(v['name'], v['ssmlGender'])


def record_google(text, voice, rate, out):
    body = json.dumps({'input': {'text': text},
                       'voice': {'languageCode': 'nl-NL', 'name': voice},
                       'audioConfig': {'audioEncoding': 'MP3', 'speakingRate': rate}}).encode()
    req = urllib.request.Request(f'{GOOGLE}/text:synthesize?key={google_key()}', data=body,
                                 headers={'Content-Type': 'application/json'})
    out.write_bytes(base64.b64decode(json.load(urllib.request.urlopen(req))['audioContent']))


def record_say(text, voice, rate, out):
    with tempfile.TemporaryDirectory() as tmp:
        aiff = pathlib.Path(tmp) / 'x.aiff'
        subprocess.run(['say', '-v', voice, '-r', str(int(180 * rate)), '-o', str(aiff), text], check=True)
        subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', '32000', str(aiff), str(out)], check=True)


def build(engine, voice, rate, limit):
    lines = json.loads(lines_file.read_text())
    if limit:
        lines = lines[:limit]
    audio.mkdir(exist_ok=True)
    ext = '.mp3' if engine == 'google' else '.m4a'
    record = record_google if engine == 'google' else record_say
    index = {}
    for i, text in enumerate(lines, 1):
        name = hashlib.sha1(f'{engine}|{voice}|{rate}|{text}'.encode()).hexdigest()[:12] + ext
        if not (audio / name).exists():
            print(f'[{i}/{len(lines)}] {text}')
            record(text, voice, rate, audio / name)
        index[text] = name
    for f in audio.iterdir():                      # drop recordings no sentence uses any more
        if f.suffix in ('.mp3', '.m4a') and f.name not in index.values():
            f.unlink()
    (audio / 'index.json').write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')) + '\n')
    size = sum(f.stat().st_size for f in audio.iterdir()) // 1024
    print(f'{len(index)} sentences, {size} KB in audio/. Now bump CACHE in sw.js and push.')


ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
sub = ap.add_subparsers(dest='cmd', required=True)
s = sub.add_parser('serve'); s.add_argument('--port', type=int, default=8000)
sub.add_parser('voices')
b = sub.add_parser('build')
b.add_argument('--engine', choices=['google', 'say'], required=True)
b.add_argument('--voice', required=True)
b.add_argument('--rate', type=float, default=0.95)
b.add_argument('--limit', type=int, default=0, help='only the first N sentences (for trying a voice)')
args = ap.parse_args()
if args.cmd == 'serve':
    serve(args.port)
elif args.cmd == 'voices':
    voices()
else:
    build(args.engine, args.voice, args.rate, args.limit)
