import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/create-rule';

type HeavyPkg = {
  name: string;
  message?: string;
  allowNamed?: boolean; // some packages are fine with named ESM imports
  suggestSubpath?: boolean; // try to suggest lib/subpath when a single import exists
};

type Options = [
  {
    packages?: HeavyPkg[];
  }
];

type MessageIds = 'heavyImport' | 'heavyImportSuggestSubpath';

const DEFAULT_PACKAGES: HeavyPkg[] = [
  {
    name: 'lodash',
    message:
      'Importing from "lodash" pulls the entire bundle in many setups. Prefer subpath imports like "lodash/map" or switch to "lodash-es" with tree-shaking.',
    allowNamed: false,
    suggestSubpath: true
  },
  {
    name: 'moment',
    message:
      'Moment is large and not tree-shakeable. Consider alternatives (date-fns/dayjs) or lazy-load locales.',
    allowNamed: false,
    suggestSubpath: false
  }
];

function isLiteral(node: TSESTree.Node): node is TSESTree.Literal & { value: string } {
  return node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string';
}

function getHeavyConfig(source: string, pkgs: HeavyPkg[]): HeavyPkg | null {
  for (const p of pkgs) {
    if (source === p.name) return p;
  }
  return null;
}

export default createRule<Options, MessageIds>({
  name: 'no-heavy-bundle-imports',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Evita importar pacotes “pesados” pelo entrypoint principal (ex.: lodash, moment). Prefira subpaths ou alternativas tree-shakeable.',
      recommended: 'recommended'
    },
    hasSuggestions: true,
    schema: [
      {
        type: 'object',
        properties: {
          packages: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                message: { type: 'string' },
                allowNamed: { type: 'boolean' },
                suggestSubpath: { type: 'boolean' }
              },
              required: ['name']
            }
          }
        },
        additionalProperties: false
      }
    ],
    messages: {
      heavyImport:
        'Heavy import detected from "{{pkg}}". {{extra}}',
      heavyImportSuggestSubpath:
        'Subpath import suggestion: "{{suggestion}}"'
    }
  },
  defaultOptions: [{}],
  create(context) {
    const pkgs = (context.options[0]?.packages?.length
      ? context.options[0].packages!
      : DEFAULT_PACKAGES) as HeavyPkg[];

    return {
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        const src = node.source;
        if (!isLiteral(src) || !src.value) return;
        const cfg = getHeavyConfig(src.value, pkgs);
        if (!cfg) return;

        // allow type-only imports
        if (node.importKind === 'type') return;

        // If allowNamed is true, named imports are acceptable
        if (cfg.allowNamed && node.specifiers.some(s => s.type === AST_NODE_TYPES.ImportSpecifier)) {
          return;
        }

        const hasOnlySingleNamed =
          node.specifiers.length === 1 && node.specifiers[0].type === AST_NODE_TYPES.ImportSpecifier;

        const extra = cfg.message ?? 'This can inflate bundle size and slow down cold starts.';

        const reportBase: TSESLint.ReportDescriptor<MessageIds> = {
          node: src,
          messageId: 'heavyImport',
          data: { pkg: cfg.name, extra }
        };

        // Provide a safe suggestion when there is a single named import and suggestSubpath is enabled
        if (cfg.suggestSubpath && hasOnlySingleNamed) {
          const spec = node.specifiers[0] as TSESTree.ImportSpecifier;
          const importedName = spec.imported.type === AST_NODE_TYPES.Identifier ? spec.imported.name : null;
          if (importedName) {
            const suggestion = `${cfg.name}/${importedName}`;
            context.report({
              ...reportBase,
              suggest: [
                {
                  messageId: 'heavyImportSuggestSubpath',
                  data: { suggestion },
                  fix(fixer) {
                    return fixer.replaceText(src, `'${suggestion}'`);
                  }
                }
              ]
            });
            return;
          }
        }

        // Otherwise just report without autofix (to avoid unsafe mass changes)
        context.report(reportBase);
      }
    };
  }
});
