const { mkdir, readdir, writeFile, readFile } = require('node:fs/promises')
const { join } = require('node:path');
const { parse } = require('yaml')

function getDiff(fst, snd) {
    const fstSet = new Set(fst)
    return snd.filter(v => fstSet.has(v))
}

function arrayEquals(fst, snd) {
    if (fst.length !== snd.length) return false

}

function getYamlDiff(fstSrc, fst, sndSrc, snd) {
    // Just check for trivial equality
    if (fst === snd) return null

    // Different types
    if (typeof fst !== typeof snd) {
        return {
            [fstSrc]: fst,
            [sndSrc]: snd
        }
    }

    // Non-object, not equal
    if (typeof fst !== 'object' && fst !== snd) {
        return {
            [fstSrc]: fst,
            [sndSrc]: snd
        }
    }

    // Object, one is array
    if (Array.isArray(fst) !== Array.isArray(snd)) {
        return {
            [fstSrc]: fst,
            [sndSrc]: snd
        }
    }

    // Both objects, both arrays
    if (Array.isArray(fst)) {
       if (fst.length !== snd.length) {
            return {
                [fstSrc]: fst,
                [sndSrc]: snd
            }
       }
    }
    const fstKeys = new Set(Object.keys(fst))
    let res = null
    for (const key of Object.keys(snd).filter(k => fstKeys.has(k))) {
        const intersected = getYamlDiff(fstSrc, fst[key], sndSrc, snd[key])
        if (intersected) {
            if (!res) res = {}
            res[key] = intersected
        }
    }
    return res
}

async function getFileDiff(firstSrc, first, secondSrc, second) {
    const firstYaml = parse(
        (await readFile(first)).toString()
    )
    const secondYaml = parse(
        (await readFile(second)).toString()
    )

    return getYamlDiff(firstSrc, firstYaml, secondSrc, secondYaml)
}

const outDir = 'cluster-intersection'
async function diffNamespaces(namespaces, first, second) {
    for (const namespace of namespaces) {
        const resources = await getDirIntersection(
            join(first, namespace),
            join(second, namespace)
        )

        for (const resource of resources) {
            await mkdir(join(outDir, namespace, resource), {
                recursive: true
            })

            const files = await getDirIntersection(
                join(first, namespace, resource),
                join(second, namespace, resource)
            )

            for (const file of files) {
                const fileDiff = await getFileDiff(
                    first,
                    join(first, namespace, resource, file),
                    second,
                    join(second, namespace, resource, file)
                )
                if (fileDiff) {
                    await writeFile(
                        join(outDir, namespace, resource, file), 
                        JSON.stringify(fileDiff, null, 2)
                    )
                }
            }
        }
    }
}

async function getDirIntersection(first, second) {
    const firstFiles = await readdir(first)
    const secondFiles = await readdir(second)
    return getDiff(firstFiles, secondFiles)
}

async function main() {
    const edb = 'edb'
    const gw = 'gw'
    const intersectingNamespaces = await getDirIntersection(edb, gw)
    await diffNamespaces(
        intersectingNamespaces,
        edb,
        gw 
    )

}

main()