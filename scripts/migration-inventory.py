"""Read-only static source inventory. Does not contact services or emit secret values."""
from pathlib import Path
from collections import defaultdict
import json, re, subprocess
files = [p for p in subprocess.check_output(['git', 'ls-files', '-z']).decode().split('\0') if p]
texts = {}
for p in files:
    if Path(p).suffix in {'.ts','.tsx','.js','.mjs','.sql','.toml','.yml','.html'} or p in {'public/_redirects','public/_headers'}:
        try: texts[p] = Path(p).read_text()
        except (UnicodeError, OSError): pass
entries = {Path(p).parts[2]: p for p in texts if re.match(r'^supabase/functions/[^/]+/index.ts$', p)}
refs = defaultdict(set)
for p, t in texts.items():
    candidates = set(re.findall(r'[\"\x27]([a-z0-9-]+)[\"\x27]', t)) | set(re.findall(r'/functions/v1/([a-z0-9-]+)', t))
    for name in candidates & entries.keys(): refs[name].add(p)
records = []
for name, p in sorted(entries.items()):
    s = '\n'.join(t for f,t in texts.items() if f.startswith('supabase/functions/'+name+'/'))
    records.append(dict(name=name, entrypoint=p, static_reference_files=sorted(refs[name]-{p}),
        env_names=sorted(set(re.findall(r'Deno\.env\.get\([\"\x27]([^\"\x27]+)', s))),
        table_names=sorted(set(re.findall(r'\.from\([\"\x27]([^\"\x27]+)', s))),
        function_targets=sorted(set(re.findall(r'/functions/v1/([a-z0-9-]+)', s)+re.findall(r'functions\.invoke\([\"\x27]([^\"\x27]+)', s))),
        lovable_ai=bool(re.search(r'LOVABLE_API_KEY|ai\.gateway\.lovable', s))))
result = dict(base_commit=subprocess.check_output(['git','rev-parse','HEAD']).decode().strip(),
    tracked_file_count=len(files), function_count=len(entries), migration_count=len(list(Path('supabase/migrations').glob('*.sql'))),
    limitations=['Static regex evidence, not a complete call graph or proof of runtime activity.', 'Absence of a reference does not prove unused. Shared imports, SQL triggers and dynamic names require manual review.', 'Names and paths only: no secret values, database records or user data.'],
    old_project_references=[dict(path=p, lines=[i for i,l in enumerate(t.splitlines(),1) if 'nojvgfbcjgipjxpfatmm' in l]) for p,t in sorted(texts.items()) if 'nojvgfbcjgipjxpfatmm' in t],
    cron_migration_files=[p for p,t in sorted(texts.items()) if p.startswith('supabase/migrations/') and re.search(r'cron\.(schedule|unschedule)',t)], functions=records)
Path('docs/migration').mkdir(parents=True,exist_ok=True)
Path('docs/migration/source-inventory.json').write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps(dict(functions=len(records), ai_functions=sum(r['lovable_ai'] for r in records), old_backend_files=len(result['old_project_references']), cron_migrations=len(result['cron_migration_files']))))
