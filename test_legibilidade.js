// Testes da lógica pura do medidor de legibilidade (funções entre /*PURE:APP:START*/ e /*PURE:APP:END*/).
const fs = require('fs');
const html = fs.readFileSync(process.env.APP_HTML || '../index.html', 'utf8');
const block = html.split('/*PURE:APP:START*/')[1].split('/*PURE:APP:END*/')[0];
const api = new Function(block + `
  return { relLuminance, contrastRatio, hexToRgb, scaleRects, legibilityLevel, lowContrastShare,
           analyzeLegibility, legibilityTip, LEG_MIN_LABEL, LEG_MIN_SMALL, LEG_SCALE };`)();

let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { fails++; console.log('FALHOU:', msg); } }
function near(a, b, eps, msg) { ok(Math.abs(a - b) <= eps, `${msg} (obtido ${a}, esperado ${b})`); }

// imagem RGBA w×h, cor por linha (fy = 0..1)
function img(w, h, colorAt) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = colorAt(x / w, y / h), i = (y * w + x) * 4;
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
  }
  return d;
}
const W = [255, 255, 255], K = [0, 0, 0];

// --- contraste e luminância
near(api.relLuminance(255, 255, 255), 1, 1e-9, 'luminância do branco');
near(api.relLuminance(0, 0, 0), 0, 1e-9, 'luminância do preto');
near(api.contrastRatio(1, 0), 21, 1e-9, 'preto/branco = 21:1');
const orange = api.relLuminance(...api.hexToRgb('#C8601A')), cream = api.relLuminance(...api.hexToRgb('#EDE5D8'));
near(api.contrastRatio(orange, cream), 3.27, 0.02, 'creme sobre laranja (valor do design system)');
ok(JSON.stringify(api.hexToRgb('#1C1B17')) === '[28,27,23]', 'hexToRgb');

// --- níveis
ok(api.legibilityLevel(0) === 'good' && api.legibilityLevel(0.10) === 'good', 'até 10% = boa');
ok(api.legibilityLevel(0.1001) === 'fair' && api.legibilityLevel(0.35) === 'fair', '10–35% = razoável');
ok(api.legibilityLevel(0.3501) === 'poor' && api.legibilityLevel(1) === 'poor', 'acima de 35% = fraca');

// --- percentagem de pixels abaixo do mínimo
const R = [{ x: 0, y: 0, w: 10, h: 10 }];
ok(api.lowContrastShare(img(10, 10, () => W), 10, 10, R, W, 1, 3) === 1, 'branco sobre branco: tudo falha');
ok(api.lowContrastShare(img(10, 10, () => K), 10, 10, R, W, 1, 3) === 0, 'branco sobre preto: nada falha');
near(api.lowContrastShare(img(10, 10, (fx) => fx < 0.5 ? W : K), 10, 10, R, W, 1, 3), 0.5, 1e-9, 'metade clara, metade escura = 50%');
// opacidade: branco a 70% sobre cinzento médio fica abaixo de 4,5:1, mas branco pleno sobre preto passa
ok(api.lowContrastShare(img(10, 10, () => [128, 128, 128]), 10, 10, R, W, 0.7, 4.5) === 1, 'texto translúcido sobre cinzento médio falha');
ok(api.lowContrastShare(img(10, 10, () => K), 10, 10, R, W, 0.7, 4.5) === 0, 'texto translúcido sobre preto passa');
// recorte: zona parcialmente fora é cortada; totalmente fora não conta
ok(api.lowContrastShare(img(10, 10, () => W), 10, 10, [{ x: 5, y: 5, w: 100, h: 100 }], W, 1, 3) === 1, 'zona que sai do canvas é cortada');
ok(api.lowContrastShare(img(10, 10, () => W), 10, 10, [{ x: 50, y: 50, w: 5, h: 5 }], W, 1, 3) === null, 'zona fora do canvas = nada para medir');
ok(api.lowContrastShare(img(10, 10, () => W), 10, 10, [], W, 1, 3) === null, 'sem zonas = nada para medir');

// --- o pior elemento ganha; elementos sem zonas são ignorados
const data = img(10, 10, (fx, fy) => fy < 0.5 ? W : K);           // metade de cima branca, metade de baixo preta
const top = [{ x: 0, y: 0, w: 10, h: 4 }], bottom = [{ x: 0, y: 6, w: 10, h: 4 }];
let res = api.analyzeLegibility(data, 10, 10, [
  { key: 'label', rects: bottom, rgb: W, alpha: 1, min: 3 },
  { key: 'cta', rects: top, rgb: W, alpha: 0.7, min: 4.5 },
  { key: 'context', rects: [], rgb: W, alpha: 1, min: 4.5 },
]);
ok(res.key === 'cta' && res.level === 'poor' && res.share === 1, 'o rodapé sobre a zona clara é o pior');
res = api.analyzeLegibility(data, 10, 10, [{ key: 'label', rects: bottom, rgb: W, alpha: 1, min: 3 }]);
ok(res.level === 'good' && res.share === 0, 'só o rótulo, sobre a zona escura = boa');
ok(api.analyzeLegibility(data, 10, 10, [{ key: 'label', rects: [], rgb: W, alpha: 1, min: 3 }]) === null, 'sem nada para medir = null');

// --- escala das zonas
const s = api.scaleRects([{ x: 60, y: 120, w: 600, h: 30 }], api.LEG_SCALE)[0];
near(s.x, 10, 1e-9, 'escala x'); near(s.y, 20, 1e-9, 'escala y'); near(s.w, 100, 1e-9, 'escala w'); near(s.h, 5, 1e-9, 'escala h');

// --- dicas
const base = { bgMode: 'photo', boxStyle: 'none', noBoxColor: 'white', overlayOpacity: 45, overlayTextLum: 0.8, share: 1, altShare: 0 };
ok(api.legibilityTip(base) === 'Experimenta Preto', 'sem caixa a branco, preto é muito melhor → Preto');
ok(api.legibilityTip({ ...base, noBoxColor: 'black' }) === 'Experimenta Branco', 'sem caixa a preto → Branco');
ok(api.legibilityTip({ ...base, altShare: 0.9 }) === 'Experimenta o Overlay', 'a outra cor não ajuda → Overlay');
ok(api.legibilityTip({ ...base, altShare: null }) === 'Experimenta o Overlay', 'sem alternativa → Overlay');
ok(api.legibilityTip({ ...base, boxStyle: 'solid' }) === 'Experimenta o Overlay', 'com caixa (rodapé) → Overlay');
ok(api.legibilityTip({ ...base, bgMode: 'overlay' }) === 'Sobe a opacidade do overlay', 'overlay com texto claro → subir opacidade');
ok(api.legibilityTip({ ...base, bgMode: 'overlay', overlayOpacity: 90 }) === null, 'overlay já no máximo → sem dica');
ok(api.legibilityTip({ ...base, bgMode: 'overlay', overlayTextLum: 0.02 }) === 'Experimenta uma cor de texto clara', 'overlay com texto escuro → texto claro');

console.log(`${passes} ok, ${fails} falhas`);
process.exit(fails ? 1 : 0);
