# Perf Fiscal

[Levando inteligência cross-file para JavaScript e React — linting de performance evoluído.]

[![npm version](https://img.shields.io/npm/v/eslint-plugin-perf-fiscal.svg?color=informational)](https://www.npmjs.com/package/eslint-plugin-perf-fiscal)
[![build](https://img.shields.io/badge/build-tsc%20--p%20tsconfig.build-blue)](#fluxo-de-desenvolvimento)
[![license](https://img.shields.io/github/license/ruidosujeira/perf-linter.svg)](LICENSE)
![Cross-File Powered](https://img.shields.io/badge/Cross--File-Analysis-blueviolet?style=flat-square)

[Perf Fiscal](https://github.com/ruidosujeira/perf-linter) é um plugin ESLint profissional para auditar aplicações JavaScript e React em busca de armadilhas recorrentes de performance. Sustentado por um mecanismo de análise TypeScript multi-arquivo, ele entrega diagnósticos focados que destacam trechos de código propensos a desperdiçar CPU, gerar lixo em excesso ou invalidar estratégias de memoização antes de chegar em produção.

> 💡 **Primeiro da categoria:** Perf Fiscal é o primeiro kit de lint de performance que correlaciona sinais multi-arquivo em tempo real, usando o checker do TypeScript para entender componentes, props e fluxos assíncronos ao longo de todo o projeto.

## Sumário

- [Principais Capacidades](#principais-capacidades)
- [Inteligência Cross-File (Novo)](#inteligência-cross-file-novo)
- [Primeiros Passos](#primeiros-passos)
- [Catálogo de Regras](#catálogo-de-regras)
- [Destaques de Configuração](#destaques-de-configuração)
- [Exemplos Guiados](#exemplos-guiados)
- [Compatibilidade](#compatibilidade)
- [Fluxo de Desenvolvimento](#fluxo-de-desenvolvimento)
- [Como Contribuir](#como-contribuir)
- [Licença](#licença)
- [Fique por Dentro](#fique-por-dentro)

## Principais Capacidades

- 🚦 Detecta padrões ineficientes em coleções e iterações que geram trabalho desnecessário.
- 🧠 Protege memoização em React, sinalizando props instáveis, arrays de dependência e lógica inline durante renderização.
- 🛰️ Correlaciona metadata de símbolos através de arquivos para entender fronteiras de memoização, tipos esperados de prop e contratos assíncronos.
- 🔥 Evita travamentos em runtime causados por backtracking catastrófico de expressões regulares.
- ⚡️ Expõe fluxos assíncronos não tratados que engolem falhas silenciosamente.
- ✨ Disponibiliza presets clássicos e flat do ESLint para adoção rápida.

## Inteligência Cross-File (Novo)

- 🔍 **Analyzer de projeto inteiro:** indexa exports, wrappers de memo e assinaturas de props esperadas (tipos de prop como função, objeto ou literal) para cada componente React, reduzindo drasticamente falsos positivos.
- 🙌 **`no-unstable-inline-props` com contexto:** relaxa avisos automaticamente para componentes não memoizados e alinha os diagnósticos com o tipo declarado da prop.
- 🛟 **`no-unhandled-promises` tipado:** reconhece helpers que retornam Promise importados de outros módulos sem depender apenas de heurísticas baseadas em nomes.
- 🧱 **Infraestrutura extensível:** regras consultam metadata compartilhada via `getCrossFileAnalyzer`, habilitando heurísticas futuras que entendem o grafo completo do projeto.

> **🧬 Perf Fiscal é o único plugin ESLint que rastreia fronteiras de memoização, tipos de prop e fluxos assíncronos *entre arquivos* — entregando diagnósticos mais inteligentes e precisos do que linters limitados a um único arquivo.**

### Captura de Alerta Cross-File

```text
tests/fixtures/cross-file/consumer.tsx:21:7
  21:7  warning  perf-fiscal/no-unhandled-promises  Unhandled Promise: await this call or return/chain it to avoid swallowing rejections.
          • Origin: useDataSource (exported from tests/fixtures/cross-file/components.tsx)
```

Esse diagnóstico rastreia o helper assíncrono até o arquivo de origem, provando que o analyzer entende fronteiras de memoização e fluxos assíncronos além do módulo atual.

## Saída de Exemplo

Ao executar `perf-fiscal/no-unstable-inline-props`, você verá feedback contextual como:

```text
src/pages/Profile.tsx:12:13: [perf-fiscal/no-unstable-inline-props] Passing inline function to memoized child <Child onSelect={...}/> — wrap in useCallback for stable renders (expected prop kind: function)
```

E para detecção de fluxos assíncronos cross-file:

```text
src/utils/api.ts:8:5: [perf-fiscal/no-unhandled-promises] Unhandled Promise returned from helper `fetchUserData` (imported from utils/http.ts) — consider awaiting or handling rejections.
```

Esses exemplos mostram como os diagnósticos enriquecidos trazem a origem e o tipo esperado de prop, acelerando correções com confiança.

## Primeiros Passos

> 🧭 **Quer diagnósticos tipados?** Consulte o guia [Configuração do Analyzer Tipado](docs/typed-analyzer-setup.md). Resumo:
> (1) crie um `tsconfig` dedicado ao lint que inclua todos os arquivos relevantes, (2) aponte `parserOptions.project`/`tsconfigRootDir`
> para esse arquivo e (3) mantenha `@typescript-eslint/parser` alinhado à versão do ESLint. Se o ESLint acusar "Cannot read file
> 'tsconfig...json'" ou "parserServices to be generated", revise as orientações de `tsconfigRootDir` descritas no guia.

### Instalação

```bash
npm install --save-dev eslint eslint-plugin-perf-fiscal
# ou
yarn add --dev eslint eslint-plugin-perf-fiscal
# ou
pnpm add -D eslint eslint-plugin-perf-fiscal
```

### Config Flat (ESLint ≥8.57)

```js
import perfFiscal from 'eslint-plugin-perf-fiscal';

const tsParser = await import('@typescript-eslint/parser');

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser.default,
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname
      }
    }
  },
  perfFiscal.configs.recommended
];
```

> **Nota:** O analyzer cross-file depende de configurações com conhecimento do projeto (`parserOptions.project` + `tsconfigRootDir`) para consultar o checker do TypeScript e seguir símbolos entre arquivos.

### Config Clássico (`.eslintrc.*`)

```js
module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: ['./tsconfig.json'],
    tsconfigRootDir: __dirname
  },
  extends: ['plugin:perf-fiscal/recommended']
};
```

### Habilitando Regras Específicas

```js
module.exports = {
  plugins: ['perf-fiscal'],
  rules: {
    'perf-fiscal/no-expensive-split-replace': 'warn',
    'perf-fiscal/prefer-array-some': 'error',
    'perf-fiscal/no-unstable-inline-props': ['warn', {
      ignoreProps: ['className'],
      checkSpreads: false
    }]
  }
};
```

## Catálogo de Regras

Cada regra possui documentação detalhada em `docs/rules/<nome-da-regra>.md`.

| Regra | Detecta | Ação Recomendada | Documentação |
| --- | --- | --- | --- |
| `perf-fiscal/detect-unnecessary-rerenders` | 🚦 Handlers inline passados para filhos memoizados | Extraia callbacks ou use `useCallback` | [docs/rules/detect-unnecessary-rerenders.md](docs/rules/detect-unnecessary-rerenders.md) |
| `perf-fiscal/no-expensive-computations-in-render` | 🧮 Trabalho síncrono pesado durante renderizações | Movê-lo para `useMemo` ou fora do componente | [docs/rules/no-expensive-computations-in-render.md](docs/rules/no-expensive-computations-in-render.md) |
| `perf-fiscal/no-expensive-split-replace` | 🔁 `split`/`replace` repetidos em loops quentes | Pré-computar e reutilizar resultados | [docs/rules/no-expensive-split-replace.md](docs/rules/no-expensive-split-replace.md) |
| `perf-fiscal/no-redos-regex` | 🔥 Regex com backtracking catastrófico | Reescrever expressão ou adicionar limites explícitos | [docs/rules/no-redos-regex.md](docs/rules/no-redos-regex.md) |
| `perf-fiscal/no-unhandled-promises` | ⚠️ Promises ignoradas | `await` ou encadear `.catch`/`.then` | [docs/rules/no-unhandled-promises.md](docs/rules/no-unhandled-promises.md) |
| `perf-fiscal/no-unstable-inline-props` | ✋ Funções/objetos inline e spreads que mudam referências | Memorizar antes de passar como prop | [docs/rules/no-unstable-inline-props.md](docs/rules/no-unstable-inline-props.md) |
| `perf-fiscal/no-unstable-usememo-deps` | 🧩 Valores instáveis em arrays de dependência | Memorizar dependências ou movê-las para fora do render | [docs/rules/no-unstable-usememo-deps.md](docs/rules/no-unstable-usememo-deps.md) |
| `perf-fiscal/prefer-array-some` | ✅ `filter(...).length` usado para checar existência | Trocar por `Array.prototype.some` | [docs/rules/prefer-array-some.md](docs/rules/prefer-array-some.md) |
| `perf-fiscal/prefer-for-of` | 🔄 Uso de `map`/`forEach` apenas por efeitos colaterais | Migrar para `for...of` para clareza e performance | [docs/rules/prefer-for-of.md](docs/rules/prefer-for-of.md) |
| `perf-fiscal/prefer-object-hasown` | 🧾 Padrões legados com `hasOwnProperty.call` | Usar `Object.hasOwn` | [docs/rules/prefer-object-hasown.md](docs/rules/prefer-object-hasown.md) |
| `perf-fiscal/prefer-promise-all-settled` | 🤝 `Promise.all` esperando falhas parciais | Migrar para `Promise.allSettled` | [docs/rules/prefer-promise-all-settled.md](docs/rules/prefer-promise-all-settled.md) |

## Destaques de Configuração

- 🧰 **Presets flat vs. clássicos:** Use `perfFiscal.configs.recommended` em configs flat ou `plugin:perf-fiscal/recommended` em configs clássicas.
- 🛰️ **Habilite a inteligência cross-file:** Configure `@typescript-eslint/parser` com `parserOptions.project` e `tsconfigRootDir` para que o Perf Fiscal possa invocar o checker do TypeScript e seguir símbolos entre arquivos.
- 🧭 **Controle de severidade:** Ajuste severidades (`off`, `warn`, `error`) conforme sua política interna.
- ⚙️ **Opções de regra:** Algumas regras expõem configurações específicas. Consulte a documentação de cada regra para detalhes. Exemplo:

  ```js
  'perf-fiscal/no-unstable-inline-props': ['warn', {
    ignoreProps: ['className', 'data-testid'],
    checkFunctions: true,
    checkObjects: true,
    checkSpreads: true
  }]
  ```

## Exemplos Guiados

### Estabilize Callbacks em React

```tsx
// Antes: callbacks recriados a cada render
const Parent = () => <Child onSelect={() => dispatch()} />;

// Depois: identidades estáveis
const Parent = () => {
  const onSelect = useCallback(() => dispatch(), []);
  return <Child onSelect={onSelect} />;
};
```

### Faça Cache de Operações de String Pesadas

```ts
// Antes: split custoso por item
for (const record of records) {
  const parts = record.path.split('/');
  visit(parts);
}

// Depois: compute uma vez
const parts = basePath.split('/');
for (const record of records) {
  visit(parts);
}
```

### Memorize Objetos Antes de Espalhar Props

```tsx
// Antes: spread gera referências instáveis
const Panel = ({ onSubmit }) => <Form {...{ onSubmit: () => onSubmit() }} />;

// Depois: payload memoizado
const Panel = ({ onSubmit }) => {
  const formProps = useMemo(() => ({ onSubmit: () => onSubmit() }), [onSubmit]);
  return <Form {...formProps} />;
};
```

## Compatibilidade

- **Node.js:** 18+
- **ESLint:** ^8.57.0 ou ^9.x
- **TypeScript:** 5.5.x (alinhado com `@typescript-eslint`)
- **React:** Diagnósticos assumem semântica de hooks do React 16.8+

🧪 RuleTester tipado: nosso [runner tipado](tests/utils/rule-tester.ts) e a CI simulam projetos React+TS reais com uso cross-file, garantindo que cada regra seja coberta com suporte do analyzer.

## Fluxo de Desenvolvimento

```bash
npm install
npm run lint
npm run test
npm run build
```

Garanta que o código compile, os testes passem e o lint esteja limpo antes de abrir um pull request.

## Como Contribuir

### Participe das discussões
- Acesse o [GitHub Discussions](https://github.com/ruidosujeira/perf-linter/discussions) para tirar dúvidas, propor ideias ou responder ao resumo semanal de auditoria. Comece pelo template "Community check-in" para que mantenedores entendam como ajudar.
- Assine as notificações de anúncios para saber quando um novo relatório for publicado ou quando houver encontros da comunidade.

### Encontre uma primeira tarefa
- Navegue pelas issues com o rótulo [`good first issue`](https://github.com/ruidosujeira/perf-linter/labels/good%20first%20issue) para atividades rápidas que ajudam a conhecer a base de código.
- Prefere orientação em português? Filtre pelo rótulo [`boa primeira contribuição`](https://github.com/ruidosujeira/perf-linter/labels/boa%20primeira%20contribui%C3%A7%C3%A3o) — cada tarefa traz passos claros, critérios de aceite e mentores disponíveis.

### Entregue mudanças com confiança
1. Abra uma issue descrevendo a heurística de performance, sinal proposto e tolerância a falsos positivos.
2. Implemente a regra em `src/rules/`, adicione cobertura em `tests/rules/` e documente em `docs/rules/<nome-da-regra>.md`.
3. Exporte a regra em `src/index.ts`, atualize os presets recomendados se necessário e referencie a documentação.
4. Rode o pipeline (`npm run lint`, `npm run test`, `npm run build`).
5. Envie o pull request explicando o sinal, a motivação e casos de borda conhecidos.

### Acompanhe os relatórios semanais
- Toda segunda-feira publicamos uma auditoria comunitária usando o [template do relatório semanal](.github/weekly-audit-report.md). O resumo destaca novos contribuidores, issues prioritárias e resultados das discussões.
- Perdeu alguma atualização? Confira a categoria de Anúncios nas Discussões para acessar o histórico e chamadas em andamento.

Precisa de ajuda para criar novas regras? Fale em inglês ou português — a comunidade está pronta para apoiar!

## Licença

Perf Fiscal é distribuído sob a [Licença MIT](LICENSE).

---

Traga a disciplina de um engenheiro de performance para cada review. Adote o Perf Fiscal para manter seu código enxuto, previsível e pronto para produção.

## Fique por Dentro

💬 Quer novidades? ⭐️ Dê uma estrela e acompanhe [ruidosujeira/perf-linter](https://github.com/ruidosujeira/perf-linter) para ser avisado sobre novas heurísticas.
