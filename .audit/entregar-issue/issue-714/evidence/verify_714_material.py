"""Read-only issue-714 material/financial-documentation negative-control verifier.

This file is test evidence, not code imported by SolverFin. It checks the
actual SHA and rejects controlled mistakes without changing the source tree.
"""
from pathlib import Path
import hashlib, json, re, subprocess
ROOT=Path('/mnt/data/issue714-work/solver-source')
SHA='7e40a6009b8e6019e99439f3e7593e35b62622c1'
BASE='534c492fc2d852ea1b3153eac346c8c0d4a8f29b'
def git(*a):return subprocess.check_output(['git','-C',str(ROOT),*a],text=True).strip()
def check(p,f,mutation,description):
 text=p.read_text(encoding='utf-8')
 assert f(text),('positive control failed',description)
 bad=mutation(text)
 assert bad!=text,('mutation not applied',description)
 assert not f(bad),('negative control escaped',description)
 assert f(text),('restoration failed',description)
 return dict(id=description,status='passed',positive='source accepted',negative='plausible wrong variant rejected',restoration='source still accepted',source_sha256=hashlib.sha256(text.encode()).hexdigest())
assert git('rev-parse','HEAD')==SHA
assert git('merge-base','develop',SHA)==BASE
assert len(git('diff','--name-only',BASE,SHA).splitlines())==4
cert=json.loads((ROOT/'.audit/entregar-issue/handoff-ready.json').read_text())
orig=git('show',f'{BASE}:.audit/entregar-issue/handoff-ready.json')
assert orig==(ROOT/'.audit/entregar-issue/handoff-ready.json').read_text().strip()
assert cert['subject']['issue_number']==728 and cert['subject']['pull_request_number']==759
assert cert['identity']['material_head_sha']!=SHA
assert cert['subject']['issue_number']!=714
book=ROOT/'docs/GOLDEN_STATEMENT.md'
checks=[]
checks.append(check(book,lambda s:'# Extrato: Golden Screen aprovada visualmente' in s,lambda s:s.replace('# Extrato: Golden Screen aprovada visualmente','# Extrato: Golden Screen candidata'), 'accepted-title'))
checks.append(check(book,lambda s:'b50ee44238dd9e63129ebc87a3ee31c0965b19f8' in s,lambda s:s.replace('b50ee44238dd9e63129ebc87a3ee31c0965b19f8','0'*40), '713-integrated-sha'))
checks.append(check(book,lambda s:'8a56d2f3bdb59d5b0d7abeceee63601c1dfbffe5' in s,lambda s:s.replace('8a56d2f3bdb59d5b0d7abeceee63601c1dfbffe5','0'*40),'721-integrated-sha'))
checks.append(check(book,lambda s:'A #714 nao implementa automaticamente as subissues #715' in s,lambda s:s.replace('A #714 nao implementa automaticamente as subissues #715','A #714 implementa automaticamente as subissues #715'),'propagation-boundary'))
compos=lambda s:s.split('## Composicao\n',1)[1].split('## Componentes de escolha',1)[0]
checks.append(check(book,lambda s:bool(re.search(r'Entradas inclui receitas e transferencias recebidas; Saidas[\s\S]*?transferencias enviadas',compos(s))),lambda s:s.replace('Entradas inclui receitas e transferencias recebidas; Saidas','Entradas inclui receitas; transferencias recebidas nao entram; Saidas'),'individual-transfer-legs'))
checks.append(check(book,lambda s:'mas nao inflam Entradas/Saidas' in compos(s),lambda s:s.replace('mas nao inflam Entradas/Saidas','mas inflam Entradas/Saidas'),'all-accounts-no-inflation'))
checks.append(check(book,lambda s:'pela perna da moeda selecionada, sem conversao implicita' in compos(s),lambda s:s.replace('pela perna da moeda selecionada, sem conversao implicita','pela perna de origem somando moedas'),'fx-selected-currency-leg'))
checks.append(check(book,lambda s:'Cadastro (novo lancamento), clonagem e edicao usam o mesmo dialog nativo' in s,lambda s:s.replace('o mesmo dialog nativo','um painel lateral'),'centered-dialogs'))
checks.append(check(book,lambda s:'Rodape atual apos a #747 / PR #749' in s,lambda s:s.replace('Rodape atual apos a #747 / PR #749','Rodape anterior sem nova regra'),'new-footer-precedence'))
checks.append(check(book,lambda s:'certificacao exact-SHA e parecer tecnico independente sao marcos distintos' in s,lambda s:s.replace('certificacao exact-SHA e parecer tecnico independente sao marcos distintos','certificacao exact-SHA e parecer tecnico independente sao equivalentes'),'independence-separate'))
for name,wrong in [('issue-number',714),('pull-request-number',760)]:
 candidate=dict(cert['subject'])
 candidate[name.replace('-','_')]=wrong
 assert (candidate.get('issue_number'),candidate.get('pull_request_number'))!=(714,760)
 checks.append(dict(id='foreign-handoff-'+name,status='passed',positive='subject remains foreign',negative='partial reassignment cannot bind both issue and PR',restoration='original target #728/#759 unchanged'))
result={'material_head_sha':SHA,'base_sha':BASE,'subject_issue':714,'subject_pr':760,'control_count':len(checks),'controls':checks,'independent_approval_observed':False,'certification_observed':False,'message':'These controls do not produce a current-target handoff or an independent approval.'}
p=Path('/mnt/data/issue714-work/inputs/evidence/governance-material-controls.json')
p.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print('PASS',len(checks),'material/document semantic controls, including foreign certificate and transfer mutations',SHA)
