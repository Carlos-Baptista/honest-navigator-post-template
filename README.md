# Editor de Capas — Honest Navigator

Ferramenta pessoal para criar rápido as capas dos reels/carrosséis do [@sircharlesvonbaptist](https://instagram.com/sircharlesvonbaptist), sem passar pelo Mac/Figma.

Corre inteiramente no browser — nada é enviado para nenhum servidor. As fontes da marca (Awesome Serif e Anybody) e os ícones estão junto do `index.html`, na raiz do repositório.

## Como usar

Abre o link do GitHub Pages (ver abaixo) no telemóvel:

1. Escolhe **Formato** (Reel 9:16, Carrossel 4:5, Quadrado 1:1) e **Fundo**:
   - **Foto** — a tua imagem com uma caixa colorida à volta do rótulo
   - **Overlay** — a tua imagem com uma camada preta por cima (opacidade ajustável) e o texto escrito diretamente, sem caixa
   - **Sólido** — uma cor da paleta, com uma grelha de pontos subtil, e o texto diretamente em cima
2. Se for **Carrossel**, aparece a secção **Páginas** — usa o `+` para adicionares slides (cada um com a sua própria foto e texto); "Exportar todas as páginas" transfere-as todas de uma vez
3. Separador **Texto**: Rótulo, Contexto e CTA — os três aceitam Enter para quebras de linha à tua escolha, além de ajustarem automaticamente linhas demasiado compridas
4. Separador **Estilo**: cor do rótulo/texto, estilo da caixa (Sólido/Papel) ou opacidade do overlay, consoante o modo de fundo escolhido
5. Separador **Posição**: grelha 3×3 para escolher onde o texto fica, mais dois sliders — ajuste fino vertical e tamanho do rótulo (50–180%)
6. **Exportar imagem** — no iPhone abre a folha de partilha nativa; escolhe "Guardar Imagem" para ir para a galeria

## Instalar como app no iPhone

1. Abre o link do GitHub Pages no **Safari** (tem de ser Safari, não a app do Claude nem outro browser)
2. Toca em Partilhar → **"Adicionar ao Ecrã Principal"**

Fica com ícone próprio (a bússola) e abre em ecrã inteiro.

## Atualizar

Sempre que houver ficheiros novos:

1. No repositório, **Add file → Upload files**
2. Arrasta os ficheiros novos (substituem os antigos com o mesmo nome)
3. Commit changes

Se a alteração incluir um `sw.js` novo (o número da versão lá dentro sobe, ex. `v2` → `v3`), sobe-o **ao mesmo tempo** que o `index.html` — é isso que força o telemóvel a limpar a cache antiga e ir buscar tudo de novo. Sem isso, o telemóvel pode continuar preso a uma versão anterior mesmo depois do upload.

Depois de atualizar: fecha a app instalada por completo e reabre. Se persistir na versão antiga, limpa os dados do site em Definições → Safari → Avançado → Dados de Sites (procura o domínio do repositório).

O link do GitHub Pages mantém-se sempre o mesmo — não é preciso repetir o "Adicionar ao Ecrã Principal".

## Paleta e tipografia (Design System v1.2)

| Cor | Hex | Uso |
|---|---|---|
| Bg (quase-preto) | `#1C1B17` | fundo da app / opção de fundo sólido |
| Surface | `#222018` | painéis, canvas vazio |
| Texto forte (creme) | `#EDE5D8` | texto principal, opção de fundo sólido |
| Texto base | `#C4B49A` | texto secundário |
| Texto mid | `#8B7D6B` | labels, texto apagado |
| Laranja | `#C8601A` | ação principal (exportar), acento |
| Sálvia | `#909C78` | acento secundário |
| Âmbar | `#C8A040` | acento secundário |
| Forest | `#1E2818` | estado ativo dos seletores |

Tipografia: **Awesome Serif** (rótulos), **Anybody** (contexto, CTA, interface). Sem border-radius em lado nenhum; divisórias sempre a 0.5px; a notação `[ Assim ]` é reservada à navegação (separadores), nunca a botões de ação.

## Estrutura de ficheiros

```
index.html
manifest.json
sw.js
awesome-serif.ttf
anybody.ttf
icon-120.png / icon-152.png / icon-167.png / icon-180.png / icon-192.png / icon-512.png
```
