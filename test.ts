const test = {
  'style/no-floating-decimal' : 'warn',
  ...{},
  'style/no-mixed-operators'  : ['warn'],
}

type test1 = {
  kir   : number
  kos
  koss? : string
}
const rules = 'test'
const plugin = {
  meta : {
    name    : '@missingcodec/eslint-plugin',
    version :  '1.0.0',
  },
  rules,
}

const meta = {
  type : 'layout',
  docs : {
    description : 'Enforces vertical alignment of type annotations and object properties',
  },
  fixable : 'whitespace',
  schema  : [],
  messages: {
    misalignedValues : 'Object values should be aligned.',
    misalignedTypes  : 'Type annotations should be aligned.',
  },
}
