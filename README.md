# The Whispering Sands

Uma mesa de RPG para **Rafael e Meg**, cada um no próprio celular ou computador,
inteiramente em inglês. A história escrita para uma aula de inglês virou uma
aventura compartilhada: um mestre por voz, cenas ilustradas durante a partida,
fichas, inventário, pistas e diário persistente. Escopo e implementação: [#1](https://github.com/raffareis/TheWhisperingSands/issues/1).

## Jogar

1. Crie uma mesa, informe seu nome e escolha Sam ou Liz.
2. Use **Invite companion** e envie o link privado à outra pessoa. Ela ocupa o
   outro personagem, no próprio navegador. Emily é a companheira conduzida pelo mestre.
3. Quando os dois entrarem, use **Begin adventure**.
4. Use **Enable voice** nos dois dispositivos. Toque no microfone para falar e
   toque novamente para terminar. Os dois ouvem o mesmo mestre e a fala do companheiro.
   É possível interromper a narração. Texto também funciona, inclusive sem microfone.
5. Quando o mestre pedir um teste, somente o personagem indicado pode usar **Roll D6**.
   Uma falha permite **Accept setback** ou **Push your luck**, uma nova tentativa por 1 HP,
   se houver vida suficiente. O mestre recebe o resultado verdadeiro.

A página central acompanha a cena; a ficha mostra atributos, vida e itens.
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

Os padrões configuráveis são `gpt-realtime-2.1` para voz, `gpt-6.1-sol` para texto
sem uma sessão de voz ativa e `gpt-image-2.5-flare` para ilustrações. Voz e imagens
utilizam a API paga; a arte inicial foi feita com a ferramenta nativa `imagegen`.
É possível pausar novas ilustrações nas configurações da mesa. O servidor limita
cada sala a 24 imagens por hora e a uma geração em andamento, com fila da cena mais recente.

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
O microfone exige HTTPS ou localhost. A publicação na internet ainda não faz parte
desta entrega; antes dela, restringir a criação de mesas aos convidados do anfitrião.
O convite autentica a segunda pessoa e não substitui uma restrição de acesso à criação.

## Estado e regras

- Uma sessão Realtime por mesa. Um jogador fala por vez; PCM mono de 24 kHz é
  encaminhado ao mestre e ao companheiro. As respostas do mestre são compartilhadas.
- O servidor executa ferramentas da IA para pedir testes, registrar consequências
  e ilustrar cenas. Cliente e modelo não escolhem o valor do D6.
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
  ou apagar o armazenamento do navegador perde essa credencial; não há recuperação de conta nesta versão.
- Reiniciar o servidor encerra a voz; habilite-a novamente para continuar com o
  estado e o diário salvos. Uma pintura interrompida fica identificada, sem retry automático.

## Validar

```bash
npm test
npm run build
npm run format:check
```

Os testes verificam regras, autorização das rolagens, decisão e custo de nova
tentativa, consequências, persistência, isolamento de salas, transporte HTTP e
WebSocket, sessão Realtime compartilhada, execução de ferramentas e atribuição de
transcrições que chegam fora de ordem. Não usam a API paga.

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

## Arte e história

Os Markdown numerados, `Encounters/` e `Assets/` preservam a aventura original.
O mestre carrega esse conteúdo como referência privada, incluindo os enigmas.
Sam começa com um canivete e Liz com um caderno de campo: itens iniciais definidos
para esta adaptação, sem alterar os arquivos originais.

A ilustração de abertura e os retratos fictícios estão em `public/art/`, com os
prompts finais e a origem em [`public/art/assets.json`](public/art/assets.json).
São os assets iniciais consumidos pelo app. Imagens de partidas e builds são
gerados fora do Git.

Referências oficiais usadas na integração: [Realtime por WebSocket](https://developers.openai.com/api/docs/guides/voice-websockets?voice-api=realtime),
[conversas Realtime e ferramentas](https://developers.openai.com/api/docs/guides/realtime-conversations)
e [geração de imagens](https://developers.openai.com/api/docs/guides/image-generation).
