import { parse, stringify } from 'yaml'
import {readFile} from 'fs/promises'

async function main() {
    const input = await readFile('./policies.yaml')
    const rules = parse(input.toString()).items.reduce((acc, v) => {
        const {enforced, patterns} = acc
        for (const rule of v.spec.rules) {
            if (!rule.validate) {
                continue
            }
            const key = v.spec.validationFailureAction
            if (!enforced[key]) enforced[key] = []
            enforced[key].push(
                rule.validate.message
            )
            patterns[rule.validate.message] = rule.validate.pattern ?? rule.validate.foreach
        }
        return acc
    }, {enforced: {}, patterns: {}})
    console.log(JSON.stringify(rules, null, 2))
}

main()
