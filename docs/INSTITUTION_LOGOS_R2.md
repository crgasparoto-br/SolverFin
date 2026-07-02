# Upload de logomarcas de instituições no R2

## Objetivo

A tela Admin global de instituições financeiras permite que o usuário master envie ou substitua logomarcas. O arquivo é enviado ao backend autenticado do SolverFin, validado no servidor e salvo no Cloudflare R2. Credenciais do R2 nunca devem ser expostas no frontend.

## Fluxo

1. Usuário master acessa `/admin/instituicoes`.
2. A tela envia PNG, JPG/JPEG ou WebP para `POST /api/admin/institutions/:institutionKey/logo`.
3. O backend valida sessão, `SOLVERFIN_MASTER_EMAILS`, instituição, MIME type, conteúdo, tamanho e assinatura básica do arquivo.
4. O backend gera uma chave segura em `institutions/<institutionKey>/logo-<hash>.<ext>` sem usar o nome original como caminho confiável.
5. O adapter R2 grava o objeto via API compatível com S3 usando assinatura AWS4.
6. A resposta retorna `publicUrl`, `objectKey`, hash, tamanho e metadados suficientes para atualizar o preview.

## Variáveis de ambiente

```env
R2_ACCOUNT_ID=00000000000000000000000000000000
R2_ACCESS_KEY_ID=dev-r2-access-key
R2_SECRET_ACCESS_KEY=dev-r2-secret-key
R2_BUCKET_NAME=solverfin-assets
R2_PUBLIC_BASE_URL=https://assets.example.invalid
R2_REGION=auto
INSTITUTION_LOGO_MAX_BYTES=2097152
```

`R2_PUBLIC_BASE_URL` deve apontar para a URL pública ou domínio customizado usado para servir os objetos do bucket. Não inclua barra final.

`INSTITUTION_LOGO_MAX_BYTES` é opcional. Quando ausente ou inválido, o limite padrão é 2 MB.

## Validações

- arquivo vazio é bloqueado;
- formatos aceitos: PNG, JPG/JPEG e WebP;
- SVG não é aceito neste ciclo para evitar risco de script/markup não sanitizado;
- MIME type precisa bater com os bytes iniciais do arquivo;
- tamanho acima do limite retorna erro controlado;
- instituição inexistente ou inativa é recusada;
- erro do R2 retorna erro controlado e não altera o metadado em memória.

## Segurança

- A autorização real está no backend com `requireMasterUser`.
- Usuário comum recebe `AUTH_ADMIN_REQUIRED` mesmo chamando o endpoint diretamente.
- O frontend nunca recebe `R2_SECRET_ACCESS_KEY` nem assina upload direto para R2.
- O nome original do arquivo é tratado apenas como metadado informativo; a chave de storage usa instituição e hash.

## Observação sobre persistência

O ciclo atual prepara o fluxo seguro, adapter R2 e resposta para a UI. Enquanto não existir uma tabela global persistida para metadados de instituições, a aplicação mantém o metadado de logo enviado em memória no processo da API. Um ciclo posterior pode trocar esse armazenamento por persistência em banco sem alterar o contrato principal do endpoint.
