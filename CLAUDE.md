# The Whispering Sands

App de RPG compartilhado para Rafael e Meg; interface e jogo inteiramente em inglês.
Escopo e acompanhamento: [#1](https://github.com/raffareis/TheWhisperingSands/issues/1).
O README documenta execução, regras e limites observados.

## Fontes e estrutura

- Markdown numerados, `Encounters/` e `Assets/`: campanha original. Não reescrever
  ou revelar os enigmas no cliente. `server/dm.ts` carrega esses arquivos no servidor.
- `server/game.ts`: regras autoritativas, atributos, dados, consequências e cenas.
- `server/store.ts`: SQLite, convites e autenticação dos dois assentos.
- `server/runtime.ts`: uma sessão Realtime por sala, tools, voz e fila de imagens.
- `server/index.ts`: HTTP, WebSocket, assets de produção e cleanup de processos.
- `shared/types.ts`: estado público; não adicionar chaves ou respostas secretas aqui.
- `src/`: React, ficha, inventário, diário, cenas e áudio PCM.
- `public/art/`: arte inicial consumida pelo app, com prompts em `assets.json`.
- `data/` e `output/`: estado privado e artefatos regeneráveis, sempre ignorados.

## Desenvolvimento e prova

Node >=24, npm, `package-lock.json`. `npm ci`, `./bin/dev`, `npm test`,
`npm run build`, `npm run format:check`.

`OPENAI_ENV_FILE` permite carregar um .env privado sem copiar a chave.
Nunca expor a chave da OpenAI ao cliente ou a logs. Produção serve somente
`output/web/`; Vite é estritamente desenvolvimento. Publicação exige HTTPS,
WebSocket e restringir criação de mesas antes de expor a API paga.

`bin/check-live.ts` é uma prova explícita com chamadas pagas. Não executá-la
em testes comuns. Reutilizar prova válida e investigar falhas antes de repetir.
Navegador de prova usa GPU real, conforme a regra herdada do workshop.

## Restrições de jogo

O servidor sorteia o D6. O modelo solicita testes e recebe resultados; não decide
rolagem, saldo de itens ou vida. Falha perigosa perde 1 HP. A decisão de aceitar
ou pagar 1 HP por um único reroll precede a narração de consequências.
Emily é NPC; Sam e Liz têm um assento cada. A sala tem exatamente dois jogadores.
Estado compartilhado e journal persistem; conexão de voz e presença são efêmeras.
