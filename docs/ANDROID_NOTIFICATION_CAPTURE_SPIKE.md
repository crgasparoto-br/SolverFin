# Spike: captura Android de notificacoes bancarias

## Objetivo

Avaliar a viabilidade de um prototipo Android separado para capturar notificacoes bancarias com consentimento explicito, whitelist de apps e minimizacao de dados antes de transformar mensagens em sugestoes no SolverFin.

## Recomendacao

Adiar a captura automatica por Notification Listener para depois do MVP e priorizar Web Share Target ou colagem manual no curto prazo.

A justificativa e que Notification Listener exige permissao sensivel, aumenta risco LGPD, pode sofrer restricoes de loja e cria uma superficie de suporte maior do que o valor necessario para validar o MVP. O fluxo de compartilhamento cobre a principal necessidade com menos risco: a pessoa escolhe ativamente o texto que deseja enviar.

## Prototipo proposto

O prototipo, quando criado, deve ser um app Android separado do PWA e sem distribuicao publica inicial.

### Fluxo

1. Mostrar tela explicando exatamente quais notificacoes podem ser lidas e para que finalidade.
2. Pedir consentimento granular antes de abrir a configuracao de Notification Listener do Android.
3. Permitir selecionar apps financeiros em whitelist local.
4. Ignorar qualquer notificacao cujo pacote nao esteja na whitelist.
5. Transformar a notificacao permitida em payload intermediario minimizado.
6. Mostrar preview mascarado e pedir confirmacao antes de enviar ao SolverFin.
7. Permitir revogar consentimento e limpar whitelist.

### Contrato minimo do payload

```json
{
  "source": "android_notification_listener",
  "packageName": "br.com.banco.demo",
  "receivedAt": "2026-06-16T12:00:00.000Z",
  "maskedPreview": "Compra aprovada em [valor] no cartao [cartao mascarado]",
  "rawTextAllowed": false,
  "consentVersion": "android-notification-spike-v1"
}
```

## Whitelist

A whitelist deve ser local, explicita e revogavel. Exemplos ficticios para teste:

- `br.com.banco.demo`
- `br.com.carteira.demo`

Qualquer pacote fora da whitelist deve ser descartado antes de gerar payload, log ou preview.

## Privacidade e LGPD

- Consentimento deve ser separado do consentimento geral de IA.
- O app deve explicar que notificacoes podem conter dados pessoais e financeiros.
- Dados brutos nao devem ser enviados automaticamente para IA.
- Logs devem registrar somente metadados tecnicos minimizados e codigos de resultado.
- O preview exibido deve mascarar cartao, documentos e valores quando possivel.
- Revogacao deve interromper captura e impedir novos envios.

## Riscos

- Permissionamento sensivel no Android e friccao alta de ativacao.
- Possivel rejeicao ou questionamento em loja por acesso a notificacoes.
- Alto risco de captura acidental de dados fora do escopo se whitelist falhar.
- Suporte variavel por fabricante, economia de bateria e versao Android.
- Necessidade de app nativo separado, com ciclo proprio de manutencao.

## Cenarios de teste do prototipo

- Permissao nao concedida: nenhum payload e criado.
- App permitido na whitelist: payload minimizado e gerado.
- App fora da whitelist: notificacao descartada sem preview.
- Consentimento revogado: captura interrompida.
- Texto incompleto: payload fica pendente de revisao humana.

## Status para o MVP

Nao implementar em producao agora. Usar Web Share Target/manual paste como fluxo MVP e reavaliar este spike quando houver frontend, inbox persistida e politica de privacidade revisada para app nativo.
