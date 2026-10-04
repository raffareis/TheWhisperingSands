# The Whispering Sands

Uma mesa de RPG para **Rafael e Meg e duplas de alunos**, cada um no próprio celular ou computador,
inteiramente em inglês. A história escrita para uma aula de inglês virou uma
aventura compartilhada: um mestre por voz, cenas ilustradas durante a partida,
fichas, inventário, pistas e diário persistente. Escopo inicial: [#1](https://github.com/raffareis/TheWhisperingSands/issues/1). Revamp artístico, enigmas e workers: [#2](https://github.com/raffareis/TheWhisperingSands/issues/2).

## Jogar

Portal: <https://meg.raffareis.com>. A primeira atividade fica em
<https://meg.raffareis.com/whispering-sands>; o catálogo em `shared/activities.ts`
permite acrescentar outras atividades. O anfitrião usa seu código privado para
criar mesas. O segundo jogador entra pelo convite, sem precisar desse código.

1. Abra a atividade, libere o acesso de anfitrião, informe seu nome e escolha Sam ou Liz.
2. Use **Invite companion** e envie o link privado à outra pessoa. Ela ocupa o
   outro personagem, no próprio navegador. Emily é a companheira conduzida pelo mestre.
3. Quando os dois entrarem, use **Begin adventure**.
4. Use **Enable voice** nos dois dispositivos. Toque no microfone para falar e
   toque novamente para terminar. Os dois ouvem o mesmo mestre e a fala do companheiro.
   É possível interromper a narração. **Ask the storyteller** envia texto ao mestre.
   **Discuss together** envia mensagens só à dupla, sem invocar a IA.
   **Enable companion audio** habilita escuta; **Talk to companion** usa um
   canal separado, sem transcrição ou persistência de áudio.
5. Quando o mestre pedir um teste, somente o personagem indicado pode usar **Roll D6**.
   Uma falha permite **Accept setback** ou **Push your luck**, uma nova tentativa por 1 HP,
   se houver vida suficiente. O mestre recebe o resultado verdadeiro.

6. **Evidence** mostra seu registro privado. Descreva-o em inglês ao parceiro;
   ele possui outra parte. Cada assento envia sua própria resposta. As duas
   precisam ser aceitas para abrir a passagem. Há três níveis de ajuda, e erros
   nos enigmas não tiram vida. Dados e Emily não substituem a resolução.

A página central acompanha a cena; a ficha mostra atributos, vida e objetos
ilustrados que podem ser examinados.
**Clues** registra apenas descobertas da partida. **Journal** guarda conversa,
rolagens e acontecimentos. As imagens aparecem quando ficam prontas, enquanto a
conversa continua. A ilustração anterior permanece visível durante a pintura.

## Executar localmente

Requisito: **Node.js 24 ou superior**, npm e uma chave da OpenAI com acesso aos
modelos configurados. O lockfile é `package-lock.json`.

```bash
npm ci
cp .env.example .env
# Preencha OPENAI_API_KEY em .env, apenas no servidor.
./bin/dev
```

Acesse <http://localhost:4317>. A chave não é enviada ao navegador nem versionada.
Para carregar uma configuração privada já existente sem copiar a chave:

```bash
OPENAI_ENV_FILE=/caminho/privado/.env ./bin/dev
```

Os padrões configuráveis são `gpt-realtime-2.1` para voz, `gpt-4.1` para texto
sem uma sessão de voz ativa e `gpt-image-2.5-flare` para ilustrações. Voz e imagens
utilizam a API paga. O banco preparado usa `gpt-image-2.5-sunburst`; durante a
partida o Flare compõe novas cenas a partir dessas imagens de referência.
É possível pausar novas ilustrações nas configurações da mesa. O servidor limita
cada sala a 24 tentativas de imagem por hora e a instalação a 120; os limites
persistem em SQLite e contam inclusive tentativas com falha. Há uma renderização
por mesa; uma cena nova substitui a pendente e aborta a antiga em andamento.
Abortar não comprova que o provedor deixou de cobrar a tentativa.

### Servidor com build

```bash
npm run build
NODE_ENV=production ./bin/dev
```

O servidor de produção serve somente `output/web/`; os arquivos originais da
aventura e as respostas dos enigmas permanecem no servidor. Não publique o
servidor Vite de desenvolvimento.

`HOST` e `PORT` configuram a escuta; o padrão é `127.0.0.1:4317`.
**Localhost é um preview neste computador.** Para jogar em celulares ou computadores
distintos, é necessário um endereço HTTPS acessível aos dois e WebSocket habilitado.
O microfone exige HTTPS ou localhost. A instalação pública no marvin-dell usa
Cloudflare Tunnel e `HOST_ACCESS_KEY` fora do repositório. Só o anfitrião pode
criar mesas pagas; convites e links de recuperação dão acesso à sala correspondente.
O cookie de anfitrião é HttpOnly, expira em sete dias e fica vinculado ao hostname.
Um link com `#host=...` habilita o navegador e remove o fragmento após sucesso.
Não coloque esse código em query strings, issues ou capturas públicas.

## Publicar no marvin-dell

O destino usa releases identificadas pelo commit, serviço de usuário
`pub-meg.service` e Cloudflare Tunnel `marvin-dell`, com a zona `raffareis.com`.
As chaves ficam em `/home/marvin/.config/whispering-sands/server.env` (0600),
carregadas por `OPENAI_ENV_FILE`. O banco durável usa
`/home/marvin/.local/share/whispering-sands/data`, fora das releases.

Depois de testes/build, commit e push, `./bin/deploy-meg` envia um arquivo do
commit e inicia `npm ci && npm run build` pelo `taskctl` remoto. Retenha o ID
devolvido e confira seu resultado antes de ativar o symlink `current`. O script
imprime os comandos de ativação; não promove uma release com build pendente.

```bash
ssh marvin-dell taskctl wait ID_DEVOLVIDO
# Depois do build verde, use o comando de symlink impresso por bin/deploy-meg.
publicar-app servico meg 4317 /home/marvin/apps/meg/current -- \
  'env NODE_ENV=production OPENAI_ENV_FILE=/home/marvin/.config/whispering-sands/server.env ./bin/dev'
PUBLICAR_DOMINIO=raffareis.com publicar-app publicar meg 4317
```

A prova `bin/check-public.ts` verifica HTTPS, criação restrita, convite,
WebSocket da dupla, recuperação/revogação e negação das fontes privadas, sem
invocar IA. Carregue o arquivo privado de anfitrião e configure `APP_URL`.

A publicação em `https://meg.raffareis.com` foi ativada em 2026-10-04.
A prova pública confirmou dois clientes WebSocket, convite sem código de anfitrião,
áudio direto entre os assentos, recuperação com revogação e sete fontes privadas
negadas. Catálogo, acesso privado do anfitrião e mesa em viewport de 390 px foram
inspecionados com NVIDIA GeForce RTX 4060, sem overflow horizontal.
A voz real foi exercitada pelo domínio em duas sessões consecutivas, desligando
e reativando o mestre: 50 e 57 blocos de áudio idênticos nos dois assentos,
atribuição correta a Sam e narrações concluídas em 34 segundos no total.
A retomada limpa os IDs de áudio da sessão anterior; a regressão integra os
68 testes. Evidência privada: `output/verification/public-voice-reopen.json`.
A entrega e os achados ASTRA são registrados em #6 e #5.

## Estado e regras

- Uma sessão Realtime por mesa. Um jogador fala por vez; PCM mono de 24 kHz é
  encaminhado ao mestre e ao companheiro. As respostas do mestre são compartilhadas.
- O servidor executa ferramentas da IA para pedir testes, registrar consequências
  e ilustrar cenas. Cliente e modelo não escolhem o valor do D6.
- Testes físicos exigem dificuldade alcançável. Definições e puzzles não usam dados.
  Zero HP não encerra a aula: com todos incapacitados, o descanso manual recupera
  3 HP por personagem. O parceiro pode cancelar um check cujo dono está offline.
- Regras originais: STR/INT/SUR somam 10; cada personagem começa com 10 HP;
  D6 + atributo deve alcançar a dificuldade, normalmente 7. Falha perigosa custa 1 HP.
- Em uma falha, a escolha de aceitar ou tentar novamente acontece antes da narração
  das consequências. A tentativa extra não duplica o dano da primeira tentativa.
- Sam e Liz são jogáveis; Emily usa os mesmos testes do servidor como NPC.
- Convites aleatórios; tokens individuais armazenados como hashes no SQLite;
  acesso a imagens geradas restrito aos integrantes da mesa.
- Sala, personagens, pistas, diário, resultados, preferência de ilustrações e
  histórico de cenas persistem em `data/adventure.sqlite`. Imagens em `data/images/`.
  `DATA_DIR` permite mover esses dados; eles ficam fora do Git.
- Cada dispositivo guarda seu token de assento localmente. Recarregar retoma a sala.
  Abrir o mesmo assento em outra aba substitui a conexão anterior. Sair do assento
  preserva a partida na lista **Saved adventures**. Em **Table settings**,
  **Help partner return** ou **Move my seat to another device** produz um link
  privado de 15 minutos, uso único. Ele preserva personagem e progresso, revoga
  o token antigo e fecha a conexão substituída. O parceiro pode recuperar um
  assento cujo armazenamento foi apagado; não existe login por e-mail.
- Reiniciar o servidor encerra a voz; habilite-a novamente para continuar com o
  estado e o diário salvos. Uma pintura interrompida fica identificada, sem retry automático.

## Validar

```bash
npm test
npm run build
npm run format:check
```

Os 68 testes verificam regras, autorização das rolagens, decisão e custo de nova
tentativa, consequências, persistência, isolamento de salas, transporte HTTP e
WebSocket, sessão Realtime compartilhada, execução de ferramentas e atribuição de
transcrições que chegam fora de ordem, conversa sem IA, recuperação/revogação
de assentos, todas as travas e três finais. Não usam a API paga.

A verificação real é explícita e faz chamadas pagas de texto, voz, TTS de uma fala
sintética de teste e uma ilustração:

```bash
# Com o app rodando e a chave no ambiente:
node --env-file=.env --import tsx bin/check-live.ts
```

O resultado fica em `output/verification/live-check.json` (ignorado pelo Git).
Na prova de 2026-10-04, duas conexões receberam **68 blocos de áudio idênticos**, a
fala sintética foi transcrita com o jogador correto e uma imagem foi gerada e
servida pela aplicação. Execução: **41 segundos**. A prova não usou microfones
físicos ou dois celulares reais. A interface foi verificada no preview T3 com
**NVIDIA GeForce RTX 4060**, em desktop e viewport de iPhone.

A prova explícita `bin/check-playable-live.ts` percorre as cinco travas com
dois assentos, discussão separada, mestre real, uma fala sintética atribuída
e resgate escolhido. Imagens ficam pausadas para reutilizar a prova válida
do renderer. Checkpoint impede repetir cobranças por engano; credenciais de
QA ficam em arquivo separado 0600 sob `output/verification/`. Antes de uma
rodada diferente, reconcilie o resultado anterior e use `PROOF_LABEL`.
`PROOF_SEATS` permite retomar os assentos já criados, sem repetir a abertura.

Na prova completa de 2026-10-04, as cinco travas foram aceitas pela dupla,
o mestre real avançou cada capítulo e registrou o resgate com a escolha livre
de partir. A voz sintética foi atribuída a Sam; os dois clientes receberam
**399 blocos de áudio idênticos**. Foram **62 segundos** de execução automatizada,
não uma medida de duração de aula. Evidência: `output/verification/playable-live-r10.json`.
A prova também identificou e corrigiu carga de credencial OpenAI indevida
pelo arquivo da fal.ai e ausência de `session.type` nas atualizações Realtime.
Avanços de capítulo agora registram a cena na mesma operação; a prova confirmou
Palm Camp, Keeper’s Archive, Voice Machine, Beacon Gallery e Ferry Quay.
Uma prova separada do caminho de texto gerou a cena Flare em 13,8 segundos,
em segundo plano, após o avanço para Palm Camp.

## Arte e história

O guia revisado `06_StoryGuide.md` e `server/puzzles.ts` substituem os antigos
roteiros de puzzles. O mestre carrega somente intro, regras, personagens e esse
guia; os demais capítulos e encontros antigos permanecem como material histórico.
Sam começa com um canivete e Liz com um caderno de campo. O mistério das vozes
roubadas conecta cinco desafios: carga, mapa, cronologia, phrasal verbs e uma
promessa condicional que reutiliza as descobertas. Leitura intermediária como
alvo de design, sem avaliação formal de nível ou penalidade por sotaque.

As pistas e respostas ficam no servidor. HTTP e WebSocket projetam somente o
registro do próprio assento. O DM recebe objetivo, progresso e hints já pedidos,
sem cartões privados ou soluções. Texto dos puzzles é HTML determinístico; imagens
nunca são a fonte de letras, números ou respostas.

O mapa privado da ilha está em `assets/dm/island-map.svg`; o grafo canônico em
`server/campaign-map.json` define oito locais, caminhos, marés, visibilidade e
as cinco passagens dependentes dos enigmas. `server/campaign-map.ts` entrega ao
DM uma orientação compacta da área, vizinhos e estado dos gates, sem chamada de
visão. O anchor do capítulo é apenas fallback: não move os personagens.
O desenho cartográfico é SVG vetorial com rótulos exatos em inglês; o grid local
das nove pedras não é o mapa da ilha nem revela a solução.

O mapa e o grafo ficam fora de `public/`, do estado HTTP/WebSocket e do contexto
dos workers de imagem. Rotas diretas e `@fs` são bloqueadas; Vite também nega
esses arquivos. O DM usa a orientação internamente, sem exibir ou ditar o mapa
aos jogadores. Maré e deslocamento são recursos narrativos, sem cronômetro
real ou penalidade por dificuldade com inglês.

A direção do ASTRA usa arquivo marítimo, guache, grafite, papel e objetos gastos.
`public/art/base-assets.json` contém nove assets com IDs, papéis, descrições,
paths, hashes, modelo, usage disponível e prompts integrais. Os nove assets
ativos são WebP gerados explicitamente com **Sunburst**, qualidade medium; os
três objetos têm transparência real. A chapa
costeira é a referência de estilo global. O worker transmite os arquivos reais
como `image[]` para `/images/edits`, junto de referências de personagens ou objetos
já conhecidos; não envia somente seus nomes. Os retratos originais preservam a
identidade dos personagens, incluindo Emily aos dezesseis anos. A seleção
prioriza estilo e personagens antes de objetos e cenários, com até quatro
referências por composição. Os WebP ativos e PNG de origem são versionados;
cenas de partidas, recibos completos de geração e builds ficam em `data/` e
`output/`, fora do Git.

O inventário usa também uma chapa Sunburst de nove espécimes, recortada em CSS
para os suprimentos, documentos, lente e fichas de palavras. Os nomes e palavras
continuam em HTML. `bin/generate-inventory-assets.ts` reutiliza a geração existente
e registra prompt, referência e hash no mesmo manifesto.

O gerador de assets chama a CLI instalada da skill imagegen e exige `uv`, a
skill e acesso à API. Geração faz chamadas pagas; ativação só deve acontecer
depois de inspecionar os oito resultados. Saídas existentes são reutilizadas e
nunca sobrescritas automaticamente:

```bash
OPENAI_ENV_FILE=/caminho/privado/.env taskctl start --timeout 3600 -- \
  node --import tsx bin/generate-base-assets.ts --all
# Depois de conferir as imagens:
node --import tsx bin/generate-base-assets.ts --activate
```

`IMAGEGEN_CLI` permite indicar outra instalação da CLI. O modelo Sunburst é
fixado no gerador; `OPENAI_IMAGE_MODEL` controla apenas as composições da partida.

## Workers, eficiência e banca

O DM usa `dispatch_background({task, contextId:"current"})`; não escreve briefing
visual nem repete o contexto. O servidor resolve uma cópia imutável dos fatos
públicos. Ilustração, recap e apoio ao inglês trabalham de forma independente:
um renderer e até dois helpers por mesa. Helpers usam `OPENAI_WORKER_MODEL`,
padrão `gpt-5.4-nano`, sem ferramentas para mudar HP, inventário ou capítulos.
O briefing visual básico é montado por código, sem chamada extra de LLM.
O mestre de voz continua em Realtime; os resultados chegam ao painel, sem falar
por cima da narração. O caminho de texto recebe uma resposta estruturada antes
de despachar workers; não há streaming de despacho antecipado nesse caminho.

Na voz, `response.output_item.done` de uma chamada concluída inicia o trabalho
antes de `response.done`; call IDs deduplicam o fallback. Resultados especulativos
aguardam confirmação da resposta antes de publicar. Cancelamento/incompletude
não executam consequências; interrupção intencional não vira erro do mestre.
Fila e aplicação dos resultados usam IDs no estado atual, sobrevivendo a clones
do estado. Restart marca jobs interrompidos, sem repetir chamadas pagas.
Jobs registram duração, modelo e tokens quando a API os fornece. Não há conversão
automática para dólar nem promessa de latência geral a partir de uma amostra.

A banca de duas lentes verificou concorrência/cancelamento e roteamento semântico.
Confirmamos e corrigimos execução de ferramentas após cancelamento, referências
mutáveis na fila, ausência de abort e limite de imagens reiniciado na RAM.
Regras, validators, deduplicação e orçamento ficam em código. Jev/Laya podem
selecionar referências entre candidatos finitos, nunca julgar respostas ou
conceder descobertas. Uso faturado e custo dos revisores nativos indisponíveis;
as cadeiras usaram GPT-6.1-Sol/high, e ASTRA implementou a direção artística.

`SYSTEM_ONE_BASE_URL`, `SYSTEM_ONE_MODEL` e `SYSTEM_ONE_API_KEY` configuram a API
compatível com Jev. Sem URL, a integração fica desligada. Jev: URL
`https://api.typesafe.ai/v1`, modelo `jev-1.13.0`. Para Laya local já instalado,
use sua URL `/v1` e modelo `english`; este projeto não instala o serviço.
`SYSTEM_ONE_SHADOW=true` preserva o fallback; `false` permite escolher um candidato
válido com confiança >=0,85. Esse limiar é experimental, não garantia de acerto.
Erro, timeout de 1,2 s, ID fora do conjunto ou baixa confiança preservam as
referências escolhidas por código. Não colocamos um classificador na frente de
todo turno. Jev/Laya não foram chamados ao vivo nem calibrados no jogo nesta entrega.

Prova paga restrita dos endpoints novos:

```bash
node --env-file=.env --import tsx bin/check-workers.ts
```

Em 2026-10-04, os dois workers começaram concorrentes: ajuda de inglês em
**2,183 s** (203 input / 54 output tokens), imagem por edits com referências em
**19,779 s** (6.523 input / 158 output tokens informados), ainda usando as
referências PNG da primeira direção artística. Evidência em
`output/verification/workers-live.json`; uma amostra, sem benchmark p50/p95.
No navegador com RTX 4060, os dois assentos receberam cartões diferentes,
abriram o primeiro puzzle e o DM real avançou para a rota de maré. Desktop e
viewport 390 px sem overflow; microfones e celulares físicos continuam sem prova.

Depois do banco Sunburst, uma composição Flare com a chapa de estilo e os três
retratos terminou em **15,541 s** (5.003 input / 158 output tokens informados).
Os quatro arquivos e seus hashes estão em
`output/verification/sunburst-composition.json`. Essa prova testa as referências
novas; não repete voz ou os helpers já verificados. Para reproduzi-la explicitamente:

```bash
node --env-file=.env --import tsx bin/check-workers.ts --sunburst-scene
```

### Cenas híbridas

Com `FAL_KEY` no servidor, o DM pode adicionar
`edit:{kind:"pose",change:"Emily lowers her pointing arm."}` à ferramenta
`illustrate_scene`. O campo aceita também `lighting`, `weather` e `object_state`.
O mestre mantém uma descrição pública factual; para novas pessoas, locais ou
composições usa `edit:null`. A edição não recebe cartões, soluções ou mapa,
somente a mudança pública curta e o frame anterior. Não há chamada de
classificador para escolher o renderer.

O worker verifica o frame imediatamente anterior, confirmado e gerado na
própria sala; local e elenco conhecido precisam coincidir, e o capítulo não
pode mudar. Assets base, placeholders herdados, arquivos ausentes e cenas
antigas sem capítulo seguem pelo Flare. Depois de duas edições consecutivas,
uma composição Flare restabelece a referência e zera a profundidade. A detecção
de elenco compara Sam/Liz/Emily mencionados; não substitui a obrigação do DM
de declarar uma composição nova quando introduzir outras pessoas.

Klein usa o endpoint direto com quatro steps e entrada/saída inline em WebP
1536×1024. Uma rejeição HTTP definitiva (400/401/403/404/422/429) permite uma
única composição Flare de fallback, reservando outra tentativa no orçamento
durável. Abort, timeout de 30 s, erro de rede/5xx, resposta inválida ou rejeição
de segurança preservam a imagem anterior e encerram o job; não repetem uma
chamada paga de resultado incerto. Jobs registram cada tentativa/modelo/tempo
e request ID quando disponível. Sem `FAL_KEY`, o renderer é somente Flare.

Para carregar as duas chaves de arquivos privados separados:

```bash
OPENAI_ENV_FILE=/caminho/privado/openai.env \
FAL_ENV_FILE=/caminho/privado/fal.env ./bin/dev
```

`/api/config` informa `imageModel` e `imageEditModel`, nunca as chaves.
A prova isolada `bin/check-hybrid.ts` reutiliza a composição Flare já aprovada
e faz uma única edição real pelo worker; não inicia voz nem altera salas dos
jogadores. Requer ambas as chaves no ambiente e a prova anterior Sunburst.
Guarda estado e imagem em `output/verification/hybrid-data/` e checkpoint em
`output/verification/hybrid-live.json`; se o checkpoint existe, recusa uma nova
cobrança até reconciliação explícita.

Na prova real do worker em 2026-10-04, uma edição Klein terminou em **9,612 s**,
sem fallback e com uma chamada; elenco e textura preservados na inspeção,
Emily com as mãos no colo. A latência variou em relação ao experimento anterior
de 5,614 s. Foram verificados roteamento, orçamento extra no fallback,
confirmação/cancelamento, respostas inválidas e isolamento dos arquivos.
Não houve nova validação com microfones nem medição p50/p95.

### Experimento fal.ai

Em 2026-10-04, sete gerações explícitas compararam a mesma composição com quatro
referências Sunburst e pequenas edições de um frame já aprovado. O script usa
`fal.run` diretamente, sem polling nem retry automático; chave apenas no
ambiente privado. Tempos incluem resposta e arquivo salvo, mas não o preflight
único de referências públicas (0,27–0,45 s).

| Modelo / operação | Resolução real | Tempo observado | Inspeção |
| --- | --- | --- | --- |
| Flare / composição anterior | 1536×1024 | 15,541 s | Boa textura e personagens; referência de outra rodada. |
| Klein 4B / quatro referências | 1536×1024 | 6,568 s; 5,994 s inline | Na segunda tentativa duplicou Liz; gestos/objetos inconsistentes. |
| Klein 9B / quatro referências | 1536×1024 | 6,904 s; 5,957 s inline | Mais rápido, mas alterou idade/rosto de Liz e ignorou direção do gesto. |
| Flux 2 Turbo / quatro referências | 1536×1024 | 22,101 s | Gesto mais fiel; sem ganho de velocidade nesta amostra. |
| Klein 9B / edição do frame aprovado | 1536×1024 | 5,614 s inline | Três personagens e textura preservados melhor; Emily abaixou o braço. |
| Klein 9B / mesma edição menor | 1024×704 | 6,062 s inline | Qualidade útil para o painel; não reduziu o tempo total nesta chamada. |

A redução de resolução foi pedida como 1024×688; o endpoint entregou 1024×704.
A inferência caiu de 1,367 s para 0,860 s, mas o restante da chamada dominou o
tempo. Não medimos separadamente rede, pré-processamento e serialização.
São amostras isoladas, sem p50/p95 nem custo faturado verificado.

O experimento [#3](https://github.com/raffareis/TheWhisperingSands/issues/3) orientou
o fluxo híbrido autorizado em [#4](https://github.com/raffareis/TheWhisperingSands/issues/4):
Sunburst no banco base, Flare para novas composições e Klein 9B para pequenas
edições. Editar um frame existente não prova capacidade de compor uma cena nova
com a mesma qualidade.

```bash
# Chamadas pagas explícitas, no máximo três por execução:
node --env-file=/caminho/privado/fal.env --import tsx bin/compare-fal.ts \
  --label=comparacao-nova
# Requer a prova prévia check-workers --sunburst-scene e seu frame local:
node --env-file=/caminho/privado/fal.env --import tsx bin/compare-fal.ts \
  --models=klein-9b --label=edicao-nova --scene=continuation --inline=true
```

`FAL_KEY` deve estar no arquivo privado. Resultados, hashes, request IDs, prompts
e imagens ficam em `output/verification/fal/`, ignorado pelo Git. Checkpoints
recusam repetir chamadas pendentes/falhas ou reutilizar saídas alteradas. Para
reusar um resultado após outro commit, `--revision=<SHA completo>` fixa a revisão
das referências. Nenhum cartão de jogador ou mapa privado entra no experimento.

Documentação: [Klein 4B](https://fal.ai/models/fal-ai/flux-2/klein/4b/edit/api),
[Klein 9B](https://fal.ai/models/fal-ai/flux-2/klein/9b/edit/api),
[Turbo](https://fal.ai/models/fal-ai/flux-2/turbo/edit/api) e
[chamada direta](https://fal.ai/docs/documentation/model-apis/inference/synchronous).

Referências consultadas: [conversas Realtime](https://developers.openai.com/api/docs/guides/realtime-conversations),
[imagens e referências](https://developers.openai.com/api/docs/guides/image-generation),
[Flare](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare),
[Sunburst](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst),
[worker nano](https://developers.openai.com/api/docs/models/gpt-5.4-nano),
[TypeSafe HTTP](https://docs.typesafe.ai/api),
[Choice](https://docs.typesafe.ai/primitives/choice) e
[limites informados pelo autor de Laya](https://github.com/NandhaKishorM/laya#honest-limits).
