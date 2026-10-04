# The Whispering Sands

App de RPG compartilhado para Rafael e Meg; interface e jogo inteiramente em inglês.
Escopo inicial: [#1](https://github.com/raffareis/TheWhisperingSands/issues/1). Revamp autorizado: [#2](https://github.com/raffareis/TheWhisperingSands/issues/2).
O README documenta execução, regras e limites observados. O portal da Meg fica
em meg.raffareis.com; a atividade RPG tem rota /whispering-sands. Catálogo público
em shared/activities.ts, sem fontes da campanha ou atividades fictícias.
Entrega jogável e publicação: #6; achados ASTRA: #5. Gestão de aulas/duplas: #7.
Teacher desk em /teacher, privado, com turmas/notas/pausa/retomada e links
permanentes por aluno. A professora não ocupa um assento.

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
- `server/store.ts`: SQLite, convites, tokens hash e recuperação de assentos
  por link de 15 minutos, uso único, com revogação do token anterior.
- `server/host-access.ts`: criação de mesas restrita pelo código privado,
  cookie HttpOnly assinado e vinculado ao host. Não versionar HOST_ACCESS_KEY.
- `server/teaching.ts`: metadata privada da professora; links permanentes hash
  e AES-GCM usando HOST_ACCESS_KEY, independentes dos tokens de assento.
  Notas nunca entram em RoomState ou prompts. Preservar chave e DB nas releases.
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
`bin/compare-fal.ts` é experimento pago. `server/image-edits.ts` implementa
o caminho Klein 9B autorizado em #4: mesma sala/local/elenco conhecido/capítulo,
frame imediatamente anterior confirmado, no máximo duas edições em sequência.
O DM fornece apenas `edit.kind` e uma mudança curta. Composições novas são Flare.
`FAL_ENV_FILE` carrega a chave privada separada no launcher; sem chave, usa Flare.
Fallback após rejeição HTTP definitiva consome outra reserva de orçamento;
abort, erro incerto e rejeição de segurança não causam segunda chamada.
`bin/check-hybrid.ts` é prova paga isolada com checkpoint, nunca teste comum.
`FAL_KEY` vem de configuração privada. Exemplos e limites observados no README.
Edição do frame prévio não prova qualidade de uma composição nova. Guardar outputs
somente em `output/verification/fal/`, nunca cartões ou mapa entre as referências.
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

A discussão da dupla fica em partyChat, nunca no journal/contexto do DM ou
dos workers. party_* relaya PCM sem IA/transcrição. Atualizar o contexto
Realtime depois de puzzle, hint e ferramenta antes da próxima resposta.
Checks são físicos, alcançáveis; descanso evita gameover da aula. A última
trava prepara o sinal; finish_rescue só encerra após o boarding beat e escolha
livre de confrontar, perdoar ou partir. Todos os finais permitem resgate.

Deploy: bin/deploy-meg empacota somente HEAD limpo e inicia build remoto.
Aguardar seu taskctl ID antes de ativar /home/marvin/apps/meg/current. O serviço
pub-meg carrega env privado; DATA_DIR fica fora de releases. Publicar pela
skill publicar-app, PUBLICAR_DOMINIO=raffareis.com. Prova pública sem IA em
bin/check-public.ts; campanha real paga e com checkpoint em
bin/check-playable-live.ts. O texto usa GPT-4.1 e a voz usa gpt-realtime-2.1.
FAL_ENV_FILE carrega somente FAL_KEY: arquivos mistos da CLI de mídia também
trazem OPENAI_API_KEY de outro projeto; passar o arquivo inteiro como --env-file
pode trocar a credencial do mestre e causar quota zero. Não repetir essa carga.

Lesson status é metadado autoritativo carregado do SQLite e projetado como
lessonStatus. Pausa/arquivo fecham voz e workers; HTTP/WS recusam turnos.
Retorno por #seat usa /entry e revoga somente a credencial daquele aluno;
#recover continua sendo uso único/15 min. bin/check-teaching.ts não chama IA.
