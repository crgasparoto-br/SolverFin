"""Read-only, exact-material source and governance-contract adversarial controls.

This script does not certify or approve an independent review. It records
actually executed positive/negative/restoration probes for issue 714.
"""
from __future__ import annotations
import argparse, hashlib, json, re, subprocess
from pathlib import Path

def sha(text: str) -> str:
    return hashlib.sha256(text.encode('utf-8')).hexdigest()

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--repo', type=Path, required=True)
    parser.add_argument('--head', required=True)
    parser.add_argument('--base', required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    root = args.repo.resolve()
    def git(*parts: str) -> str:
        return subprocess.check_output(['git','-C',str(root),*parts],text=True).strip()
    assert git('rev-parse','HEAD') == args.head
    assert git('rev-parse','develop') == args.base
    assert git('merge-base','--is-ancestor','b50ee44238dd9e63129ebc87a3ee31c0965b19f8',args.base) == ''
    assert git('merge-base','--is-ancestor','8a56d2f3bdb59d5b0d7abeceee63601c1dfbffe5',args.base) == ''
    golden = (root/'docs/GOLDEN_STATEMENT.md').read_text('utf-8')
    adr = (root/'docs/adr/0018-golden-statement-consolidated-by-currency.md').read_text('utf-8')
    ledger = (root/'docs/audits/ISSUE_714_CLOSEOUT_LEDGER.md').read_text('utf-8')
    snapshot = json.loads((root/'.audit/entregar-issue/issue-714/specification-snapshot.json').read_text())
    closure = json.loads((root/'.audit/entregar-issue/issue-714/requirement-closure.json').read_text())
    prior = json.loads((root/'.audit/entregar-issue/handoff-ready.json').read_text())
    assert prior['identity']['material_head_sha'] != args.head
    assert prior['identity']['base_sha'] != args.base
    assert snapshot['issue'] == 714
    assert len(closure['obligations']) == 26
    deferred = {v['id'] for v in closure['obligations'] if v['disposition'] == 'deferred'}
    assert deferred == {'OBL-003','OBL-008','OBL-021','OBL-023','OBL-024','OBL-025','OBL-026'}
    checks = []
    def probe(identifier: str, path: str, predicate, mutate):
        text = (root/path).read_text('utf-8')
        assert predicate(text), ('positive failed',identifier)
        bad = mutate(text)
        assert bad != text, ('mutation was not applied',identifier)
        assert not predicate(bad), ('negative escaped',identifier)
        assert predicate(text), ('restoration failed',identifier)
        checks.append({'id':identifier,'status':'passed','positive':'actual source accepted',
                       'negative':'mutated source rejected','restoration':'source unchanged and accepted',
                       'source_sha256':sha(text),'subject_sha':args.head})
    g='docs/GOLDEN_STATEMENT.md'
    probe('approved-title',g, lambda s:'# Extrato: Golden Screen aprovada visualmente' in s,
          lambda s:s.replace('# Extrato: Golden Screen aprovada visualmente','# Extrato: Golden Screen candidata'))
    probe('713-integrated-sha',g,lambda s:'b50ee44238dd9e63129ebc87a3ee31c0965b19f8' in s,
          lambda s:s.replace('b50ee44238dd9e63129ebc87a3ee31c0965b19f8','0'*40))
    probe('721-integrated-sha',g,lambda s:'8a56d2f3bdb59d5b0d7abeceee63601c1dfbffe5' in s,
          lambda s:s.replace('8a56d2f3bdb59d5b0d7abeceee63601c1dfbffe5','0'*40))
    probe('propagation-boundary',g,lambda s:'A #714 nao implementa automaticamente as subissues #715' in s,
          lambda s:s.replace('A #714 nao implementa automaticamente as subissues #715','A #714 implementa automaticamente as subissues #715'))
    def composition(s): return s.split('## Composicao\n',1)[1].split('## Componentes de escolha',1)[0]
    probe('individual-transfer-legs',g,lambda s:'Entradas inclui receitas e transferencias recebidas; Saidas' in composition(s),
          lambda s:s.replace('Entradas inclui receitas e transferencias recebidas; Saidas','Entradas inclui receitas; transferencias recebidas nao entram; Saidas'))
    probe('all-accounts-no-inflation',g,lambda s:'mas nao inflam Entradas/Saidas' in composition(s),
          lambda s:s.replace('mas nao inflam Entradas/Saidas','mas inflam Entradas/Saidas'))
    probe('fx-selected-currency-leg',g,lambda s:'pela perna da moeda selecionada, sem conversao implicita' in composition(s),
          lambda s:s.replace('pela perna da moeda selecionada, sem conversao implicita','pela perna de origem somando moedas'))
    probe('centered-dialogs',g,lambda s:'Cadastro (novo lancamento), clonagem e edicao usam o mesmo dialog nativo' in s,
          lambda s:s.replace('o mesmo dialog nativo','um painel lateral'))
    probe('footer-precedence',g,lambda s:'Rodape atual apos a #747 / PR #749' in s,
          lambda s:s.replace('Rodape atual apos a #747 / PR #749','Rodape anterior sem nova regra'))
    probe('independence-distinct',g,lambda s:'certificacao exact-SHA e parecer tecnico independente sao marcos distintos' in s,
          lambda s:s.replace('certificacao exact-SHA e parecer tecnico independente sao marcos distintos',
                             'certificacao exact-SHA e parecer tecnico independente sao equivalentes'))
    l='docs/audits/ISSUE_714_CLOSEOUT_LEDGER.md'
    probe('inventory-26-not-22',l,lambda s:'**26 obligations**' in s,
          lambda s:s.replace('**26 obligations**','**22 obligations**',1))
    probe('inventory-7-deferred',l,lambda s:'**19 covered / 7 deferred**' in s,
          lambda s:s.replace('**19 covered / 7 deferred**','**19 covered / 3 deferred**',1))
    probe('prospective-not-retroactive',l,lambda s:'`superseded-by-prospective-review` only' in s,
          lambda s:s.replace('`superseded-by-prospective-review` only','`passed` always',1))
    probe('required-check-pending',l,lambda s:'still require only `Delivery V2 gate`' in s,
          lambda s:s.replace('still require only `Delivery V2 gate`','already require session review',1))
    probe('review-seven-deferred',l,lambda s:'OBL-023, OBL-024, OBL-025, OBL-026' in s,
          lambda s:s.replace('OBL-023, OBL-024, OBL-025, OBL-026','OBL-023, OBL-024, OBL-025',1))
    probe('center-and-financial-adr', 'docs/adr/0018-golden-statement-consolidated-by-currency.md',
          lambda s:'permanecem nos cards' in s,
          lambda s:s.replace('permanecem nos cards','sao removidas dos cards'))
    result = {
      'schema_version':1,'material_head_sha':args.head,'base_sha':args.base,
      'subject_issue':714,'subject_pr':760,'control_count':len(checks),'controls':checks,
      'independent_approval_observed':False,'certification_observed':False,
      'message':'Source controls executed at exact material; review and required checks remain pending.'
    }
    args.out.parent.mkdir(parents=True,exist_ok=True)
    args.out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'PASS {len(checks)} exact-material source-mutation/restoration controls at {args.head}; no approval')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
