# The Whispering Sands

App de RPG compartilhado para Rafael e Meg; interface e jogo inteiramente em inglês.
Escopo inicial: [#1](https://github.com/raffareis/TheWhisperingSands/issues/1). Revamp autorizado: [#2](https://github.com/raffareis/TheWhisperingSands/issues/2).
O README documenta execução, regras e limites observados.

## Fontes e estrutura

- `06_StoryGuide.md` e `server/puzzles.ts`: campanha revisada por pedido explícito.
  DM carrega intro/regras/personagens/guia; capítulos antigos ficam como histórico.
  Pistas privadas por assento, respostas e validators nunca entram no cliente.
- `server/workers.ts`: jobs assíncronos, snapshots públicos, referências reais,
  deduplicação e optional System One. Regras e soluções ficam em código.
- `server/campaign-map.json` e `assets/dm/island-map.svg`: geografia privada do DM.
  `server/campaign-map.ts` reduz o contexto ao entorno, sem visão por turno.
  Nunca copiar para `public/`, projeções dos jogadores ou referências de imagem.
  Toda passagem da campanha respeita o enigma; maré não pune ritmo da aula.
- `server/game.ts`: regras autoritativas, atributos, dados, consequências e cenas.
- `server/store.ts`: SQLite, convites e autenticação dos dois assentos.
- `server/runtime.ts`: uma sessão Realtime por sala, tools, voz e fila de imagens.
- `server/index.ts`: HTTP, WebSocket, assets de produção e cleanup de processos.
- `shared/types.ts`: estado público e view do próprio assento; projeção HTTP/WS
  em `server/puzzles.ts`. Não adicionar chaves, soluções ou cartões do parceiro.
- `src/`: React, ficha, inventário, diário, cenas e áudio PCM.
- `public/art/base-assets.json`: banco ativo Sunburst com proveniência e referências.
  PNG originais são fontes, WebP são consumidos pelo app e pelos edits Flare.
  `bin/generate-base-assets.ts` usa a CLI imagegen instalada, sem sobrescrever saídas.
  `assets.json` preserva a proveniência da primeira arte.
- `data/` e `output/`: estado privado e artefatos regeneráveis, sempre ignorados.

## Desenvolvimento e prova

Node >=24, npm, `package-lock.json`. `npm ci`, `./bin/dev`, `npm test`,
`npm run build`, `npm run format:check`.

`OPENAI_ENV_FILE` permite carregar um .env privado sem copiar a chave.
Nunca expor a chave da OpenAI ao cliente ou a logs. Produção serve somente
`output/web/`; Vite é estritamente desenvolvimento. Publicação exige HTTPS,
WebSocket e restringir criação de mesas antes de expor a API paga.

`bin/check-live.ts` e `bin/check-workers.ts` são provas explícitas com chamadas pagas. Não executá-la
em testes comuns. Reutilizar prova válida e investigar falhas antes de repetir.
Navegador de prova usa GPU real, conforme a regra herdada do workshop.

## Restrições de jogo

O servidor sorteia o D6. O modelo solicita testes e recebe resultados; não decide
rolagem, saldo de itens ou vida. Falha perigosa perde 1 HP. A decisão de aceitar
ou pagar 1 HP por um único reroll precede a narração de consequências.
Emily é NPC; Sam e Liz têm um assento cada. A sala tem exatamente dois jogadores.
Estado compartilhado e journal persistem; conexão de voz e presença são efêmeras.

Os dois assentos precisam resolver cada evidence lock antes do avanço. Emily ou
D6 nunca substituem a solução. Erro de puzzle não perde HP. O DM não tem cartões
privados ou soluções; seus hints são apenas os tiers já pedidos no painel.
Workers não podem mudar regras. Resultado especulativo só publica após resposta
completada; cancelamento invalida o job. Limites de tentativas persistem no SQLite.
A biblioteca `public/art/base-assets.json` guarda referências e proveniência;
texto dos puzzles fica em HTML, não na arte gerada.
