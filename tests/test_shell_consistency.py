"""The app shell is named in three places that must agree: the <script>/<link> tags in index.html (what the
page loads), sw.js SHELL (what works offline) and serve.py's allowlist (what the server will hand out).
A file added to one and not the others is an offline page that can't find its script, or a 404."""
import json
import re

from conftest import REPO

import serve


def sw_shell():
    src = (REPO / 'sw.js').read_text(encoding='utf-8')
    block = re.search(r'const SHELL = \[(.*?)\];', src, re.S).group(1)
    return [s for s in re.findall(r"'([^']*)'", block)]


def index_refs():
    html = (REPO / 'index.html').read_text(encoding='utf-8')
    scripts = re.findall(r'<script\s+src="([^"]+)"', html)
    links = re.findall(r'<link\s+rel="(?:stylesheet|manifest|apple-touch-icon|icon)"[^>]*\shref="([^"]+)"', html)
    return scripts, links


def manifest_icons():
    m = json.loads((REPO / 'manifest.json').read_text(encoding='utf-8'))
    return {i['src'] for i in m['icons']}


def rel(p):
    return p[2:] if p.startswith('./') else p


def test_index_has_no_inline_script_and_loads_files_only():
    html = (REPO / 'index.html').read_text(encoding='utf-8')
    assert not re.search(r'<script(?![^>]*\ssrc=)[^>]*>', html), 'every script is a file the shell can cache'
    scripts, links = index_refs()
    assert scripts and links


def test_sw_shell_equals_what_index_and_manifest_load():
    scripts, links = index_refs()
    expected = {'', 'index.html'} | set(scripts) | set(links) | manifest_icons()
    shell = {rel(p) for p in sw_shell()}
    assert shell == expected, 'sw.js SHELL vs index.html tags + manifest icons: missing %s, extra %s' % (
        sorted(expected - shell), sorted(shell - expected))
    assert len(sw_shell()) == len(shell), 'no duplicate SHELL entries'


def test_every_shell_file_is_served_and_exists():
    for p in sw_shell():
        r = rel(p)
        assert serve.public_rel('/' + r) == r, '%s is in SHELL but serve.py would 404 it' % p
        if r:
            assert (REPO / r).is_file(), '%s is in SHELL but missing from the checkout' % p


def test_overlayable_paths_are_shell_files_the_index_loads():
    scripts, links = index_refs()
    loaded = set(scripts) | set(links)
    assert serve.OVERLAYABLE <= loaded, 'every overlayable data file is actually loaded by index.html'
    assert {s for s in scripts if s.startswith('data/')} <= serve.OVERLAYABLE, 'every data/*.js the page loads can be overlaid'
