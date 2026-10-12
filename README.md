# Editor de Capas

Cria capas de reels e carrosséis fiéis a uma marca, diretamente no telemóvel, sem precisar de saber design. Pensado para a [@sircharlesvonbaptist](https://instagram.com/sircharlesvonbaptist) e para quem a queira usar com a sua própria identidade.

Corre inteiramente no browser: **sem backend, sem conta, sem upload**. As fotos nunca saem do dispositivo.

## Como usar

1. Escolhe **Formato** (Reel 9:16, Carrossel 4:5, Quadrado 1:1) e **Fundo**:
   - **Foto**: a tua imagem com uma caixa colorida à volta do rótulo (Sólida ou Papel), ou **Sem caixa**, com o texto só a branco ou só a preto para garantir o contraste
   - **Overlay**: a tua imagem com uma camada preta (opacidade ajustável) e o texto diretamente por cima
   - **Sólido**: uma cor da marca com uma grelha subtil de pontos
2. Carrega a foto. No **Carrossel**, usa **Páginas** para juntar slides (cada um com a sua foto e o seu texto) e "Exportar todas as páginas".
3. Separador **Texto**: Rótulo, Contexto e CTA. Aceitam Enter para quebras de linha à tua escolha.
4. Separador **Estilo**: cor e estilo da caixa, ou Branco/Preto se escolheres "Sem caixa" (e, no Overlay, a opacidade).
5. Separador **Posição**: grelha 3×3, ajuste fino vertical e tamanho do texto (Pequeno / Médio / Grande).
6. **Exportar imagem**: no iPhone abre a folha de partilha; escolhe "Guardar Imagem" para ir para a galeria.

No Reel há ainda o botão **Zona segura** (desligado por omissão), que mostra onde a interface do Instagram tapa o conteúdo. É só uma ajuda no ecrã e nunca aparece na imagem exportada.

## Criar o meu estilo

O botão no topo abre o painel da marca: **2 fontes** (TTF, OTF, WOFF ou WOFF2, até 800 KB cada) e **5 cores** com papel definido (Base, Texto, Acento, Secundária, Clara), com pré-visualização antes de guardar. A Honest Navigator é a predefinição.

- A marca aplica-se ao **conteúdo exportado**. A interface do editor mantém sempre as mesmas fontes e cores, para continuar legível seja qual for a fonte escolhida.
- Se uma fonte guardada deixar de carregar, só essa volta à predefinida e a app avisa.
- "Exportar estilo" / "Importar estilo" guardam e carregam a marca num ficheiro `.json`, útil para a passar a alguém ou para a levar entre o Safari e a app instalada.
- "Guardar e aplicar" recarrega a app: os textos mantêm-se, mas as fotos têm de ser adicionadas de novo.

## O que fica guardado, e onde

Tudo em `localStorage`, neste dispositivo:

| O quê | Chave | Notas |
|---|---|---|
| Estilo (fontes e cores) | `editorCapasBrandKit` | Fontes guardadas dentro do próprio registo. Validado ao ler; o que for inválido volta à predefinição. |
| Rascunho (textos e definições) | `editorCapasDraft` | Guardado automaticamente. **As fotos nunca são guardadas.** "Recomeçar" apaga-o. |

Se o iOS descartar o separador, os textos voltam; as fotos têm de ser adicionadas de novo. O armazenamento do Safari e o da app instalada no ecrã principal podem ser separados: se configurares o estilo num e não aparecer no outro, usa exportar/importar.

## Fotos grandes

Ao carregar, a foto é reduzida logo para o tamanho de que o Reel precisa (no máximo cobrir 1080×1920 a 1×) e o original é largado, em vez de se manter a resolução total em memória. Se o ficheiro não abrir, aparece um aviso em vez de falhar em silêncio.

## Instalar como app no iPhone

1. Abre o link no **Safari** (não na app do Claude nem noutro browser)
2. Partilhar → **Adicionar ao Ecrã Principal**

## Atualizar

1. No repositório, **Add file → Upload files** e arrasta os ficheiros novos (substituem os que têm o mesmo nome)
2. Se houver um `sw.js` novo (o número da versão sobe, por exemplo `v11` → `v12`), sobe-o **ao mesmo tempo** que o `index.html`: é isso que força o telemóvel a largar a cache antiga
3. Fecha a app instalada por completo e reabre. Se persistir na versão antiga, limpa os dados do site em Definições → Safari → Avançado → Dados de Sites

## Estrutura

```
index.html   manifest.json   sw.js
awesome-serif.ttf   anybody.ttf
icon-120.png  icon-152.png  icon-167.png  icon-180.png  icon-192.png  icon-512.png
```
