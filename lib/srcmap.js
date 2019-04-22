'use strict';

const assert  = require('assert');
const remixUtil = require('remix-lib/src/util');
const SourceMappingDecoder = require('../compat/remix-lib/sourceMappingDecoder.js');
const opcodes = require('remix-lib/src/code/opcodes');

module.exports = {
    isVariableDeclaration: function (srcmap, ast) {
        const sourceMappingDecoder = new SourceMappingDecoder();
        const sourceLocation = sourceMappingDecoder.decode(srcmap);
        return sourceMappingDecoder.findNodeAtSourceLocation('VariableDeclaration',
            sourceLocation, ast);
    },

    isDynamicArray: function (node) {
        return (node.stateVariable &&
            node.visibility === 'public' &&
            node.typeName.nodeType === 'ArrayTypeName');
    },

    makeOffset2InstNum: function(hexstr) {
        const bytecode = remixUtil.hexToIntArray(hexstr);
        const instMap = {};
        let j = -1;
        for (let i = 0; i < bytecode.length; i++) {
            j++;
            const opcode = opcodes(bytecode[i], true);
            if (opcode.name.slice(0, 4) === 'PUSH') {
                let length = bytecode[i] - 0x5f;
                i += length;
            }
            instMap[i] = j;
        }
        return instMap;
    },

    seenIndices: function(sourceMap) {
        const seen = new Set();
        const srcArray = sourceMap.split(';');
        for (const src of srcArray) {
            const fields = src.split(':');
            if (fields.length >= 3) {
                const index = fields[2];
                // File index -1 means no file exists.
                // Value '' means that the field is empty but present
                // to be able to give a 4th value.
                // Skip either of these.
                if (index !== '-1' && index !== '') {
                    seen.add(index);
                }
            }
        }
        return seen;
    },

    zeroedSourceMap: function(sourceMap) {
        const srcArray = sourceMap.split(';');
        let modArray = [];
        let indexSeen = -2;
        for (const src of srcArray) {
            const fields = src.split(':');
            if (fields.length >= 3) {
                const index = fields[2];
                if (index !== '-1' && index !== '') {
                    if (indexSeen !== -2) {
                        assert(indexSeen === index,
                            `assuming only one index ${indexSeen} needs moving; saw ${index} as well`);
                    }
                    fields[2] = '0';
                }
            }
            const modFields = fields.join(':');
            modArray.push(modFields);
        }
        return modArray.join(';');
    },
};
