# FlowDeploy

> Deploy automático: todo push no branch `master` publica direto na Vercel.

Interface web local para criar, montar as telas, publicar e consultar
**WhatsApp Flows** através da API do Blip (`msging.net`) — sem precisar
abrir o Postman e montar os comandos na mão.

Ela reproduz exatamente as 4 chamadas da collection `Flows.postman_collection.json`:

1. **Criar flow** — `POST /whatsapp-flows`
2. **Enviar o JSON das telas** — `POST /whatsapp-flows/flow-json/{flowId}`
3. **Publicar** — `GET /whatsapp-flows/publish/{flowId}`
4. **Consultar** — `GET /whatsapp-flows/{flowId}`

Todas elas continuam sendo, por baixo dos panos, um `POST` para
`https://{seu-bot}.http.msging.net/commands` — só muda o `method` e a `uri`
dentro do corpo, exatamente como no Postman.

## Como rodar

Pré-requisito: [Node.js](https://nodejs.org) instalado (18 ou mais recente).

```bash
cd flows-builder
npm install
npm start
```

Abra **http://localhost:3000** no navegador.

## Configuração

Na primeira vez que abrir o app, uma tela de **Configurações** vai
aparecer pedindo:

- **Contrato**: só o subdomínio usado no Postman, sem `https://`, sem
  `.http.msging.net` e sem `/commands` (no exemplo original era `wlck`,
  de `wlck.http.msging.net`) — é a parte que muda de contrato para
  contrato.
- **Authorization**: o valor completo do header `Authorization` que você
  usava no Postman (ex: `Key ZXhhbXBsZWJvdDpzdWFTZW5oYUFxdWk=`).

O destinatário (`to`) não é mais configurável: o app sempre usa o padrão
`postmaster@wa.gw.msging.net`.

Esses dados ficam salvos **só no navegador** (via `localStorage`) e são
enviados a cada chamada pra API — o servidor não guarda nada em disco.
Isso significa que:

- Cada pessoa que usa o app (mesmo numa instância compartilhada) configura
  a própria conta/contrato, sem ver ou sobrescrever a dos outros.
- Trocou de navegador ou de computador? Precisa configurar de novo lá.
- Se quiser um valor padrão pra você mesmo (uso solo, sem precisar abrir a
  tela de Configurações toda vez), copie `.env.example` para `.env` e
  preencha `BLIP_CONTRACT`/`BLIP_AUTHORIZATION` — o servidor usa isso como
  fallback só quando o navegador não mandou nada.

## Deploy (Vercel ou qualquer host)

Como o servidor não escreve nada em disco, o app funciona em ambientes
serverless (Vercel, etc.) sem precisar de banco de dados ou disco
persistente — já tem um `vercel.json` pronto no projeto.

```bash
npm i -g vercel
vercel
```

Depois de publicado, cada pessoa que acessar o link vai configurar a
própria Authorization na tela de Configurações (fica só no navegador dela).
Se preferir um host com servidor sempre ativo (Render, Railway, Fly.io,
um VPS), também funciona normalmente com `npm start` — não precisa do
`vercel.json` nesse caso.

## Como usar

1. **Criar flow**: informe apenas o nome do flow e clique em "Criar flow"
   (a categoria é enviada automaticamente como `OTHER`). A resposta da API
   aparece na tela e, quando possível, o **ID do flow** já é preenchido
   automaticamente (confira/ajuste se necessário — o ID é usado nas
   próximas 3 etapas).
2. **Colar JSON**: cole o JSON completo do flow (o mesmo formato aceito
   pelo WhatsApp Flow Builder — objeto com `version` e `screens`, ou só o
   array de `screens`) e clique em "Enviar JSON para o flow".
3. **Publicar**: publica o flow que está com o ID informado na etapa 1.
4. **Consultar**: busca e exibe o estado atual do flow na API.

## Limitações conhecidas

- A categoria do flow é sempre `OTHER` — não há seletor de categorias na
  UI. Para usar outra categoria, ajuste `DEFAULT_CATEGORIES` em
  `src/routes/flows.js`.
- Não há mais editor visual de telas: o JSON do flow precisa ser montado
  fora do app (ex: no Meta Flow Builder, ou editado manualmente) e colado
  na etapa 2.
- A resposta de "criar flow" é exibida crua (JSON completo) porque o
  formato exato de retorno da sua instância não estava documentado na
  collection original; o app tenta adivinhar o ID automaticamente, mas
  sempre confira o campo antes de seguir para as próximas etapas.

## Estrutura do projeto

```
flows-builder/
  server.js               # entrypoint: monta o Express, plugs as rotas, sobe o servidor
  src/
    routes/
      config.js            # GET /api/config
      flows.js              # POST /api/flows, PUT .../screens, POST .../publish, GET /api/flows/:id
    services/
      blipClient.js          # cliente da API do Blip (sendCommand) + credenciais por requisição
    utils/
      httpErrors.js           # tradução de erros do sendCommand pra respostas HTTP
  public/
    index.html            # wizard com as 4 etapas
    app.js                 # navegação entre etapas + chamadas à API
    styles.css
    skeps-logo.webp        # logo da Skeps (ícone recortado via CSS no topbar)
  vercel.json              # config pra deploy serverless na Vercel
  .env.example              # valores padrão opcionais (BLIP_CONTRACT/BLIP_AUTHORIZATION)
```
