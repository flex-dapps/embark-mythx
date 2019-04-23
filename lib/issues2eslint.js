'use strict';

const path = require('path');
const assert = require('assert');
const SourceMappingDecoder = require(
    'remix-lib/src/sourceMappingDecoder');
const srcmap = require('./srcmap');
const mythx = require('./mythXUtil');

const mythx2Severity = {
    High: 2,
    Medium: 1,
};

const isFatal = (fatal, severity) => fatal || severity === 2;

const getUniqueMessages = messages => {
    const jsonValues = messages.map(m => JSON.stringify(m));
    const uniuqeValues = jsonValues.reduce((accum, curr) => {
        if (accum.indexOf(curr) === -1) {
            accum.push(curr);
        }
        return accum;
    }, []);

    return uniuqeValues.map(v => JSON.parse(v));
};

const calculateErrors = messages =>
    messages.reduce((acc,  { fatal, severity }) => isFatal(fatal , severity) ? acc + 1: acc, 0);

const calculateWarnings = messages =>
    messages.reduce((acc,  { fatal, severity }) => !isFatal(fatal , severity) ? acc + 1: acc, 0);


const getUniqueIssues = issues => 
    issues.map(({ messages, ...restProps }) => {
        const uniqueMessages = getUniqueMessages(messages);
        const warningCount = calculateWarnings(uniqueMessages);
        const errorCount = calculateErrors(uniqueMessages);

        return {
            ...restProps,
            messages: uniqueMessages,
            errorCount,
            warningCount,
        };
    });

const keepIssueInResults = function (issue, config) {

    // omit this issue if its severity is below the config threshold
    if (config.severityThreshold  && issue.severity < config.severityThreshold) {
        return false;
    }

    // omit this if its swc code is included in the blacklist
    if (config.swcBlacklist && config.swcBlacklist.includes(issue.ruleId)) {
        return false;
    }

    // if an issue hasn't been filtered out by severity or blacklist, then keep it
    return true;

};


class MythXIssues {
    constructor(buildObj, config) {
        this.issues = [];
        this.logs = [];
        //console.log("mythx", JSON.stringify(mythx))
        this.buildObj = mythx.embark2MythXJSON(buildObj);
        this.debug = config.debug;
        this.logger = config.logger;
        this.sourceMap = this.buildObj.sourceMap;
        this.sourcePath = buildObj.sourcePath;
        this.deployedSourceMap = this.buildObj.deployedSourceMap;
        this.offset2InstNum = srcmap.makeOffset2InstNum(this.buildObj.deployedBytecode);
        this.contractName = buildObj.contractName;
        this.sourceMappingDecoder = new SourceMappingDecoder();
        //console.log("buildObj", buildObj)
        this.asts = this.mapAsts(this.buildObj.sources);
        this.lineBreakPositions = this.mapLineBreakPositions(this.sourceMappingDecoder, this.buildObj.sources);
    }

    setIssues(issueGroups) {
        for (let issueGroup of issueGroups) {
            if (issueGroup.sourceType === 'solidity-file' &&
                issueGroup.sourceFormat === 'text') {
                const filteredIssues = [];
                for (const issue of issueGroup.issues) {
                    for (const location of issue.locations) {
                        if (!this.isIgnorable(location.sourceMap)) {
                            filteredIssues.push(issue);
                        }
                    }
                }
                issueGroup.issues = filteredIssues;
            }
        }
        const remappedIssues = issueGroups.map(mythx.remapMythXOutput);
        this.issues = remappedIssues
            .reduce((acc, curr) => acc.concat(curr), []);
        issueGroups.forEach(issueGroup => {
            this.logs = this.logs.concat((issueGroup.meta && issueGroup.meta.logs) || []);
        });
    }

    mapLineBreakPositions(decoder, sources) {
        const result = {};

        Object.entries(sources).forEach(([ sourcePath, { source } ]) => {
            if (source) {
                result[sourcePath] = decoder.getLinebreakPositions(source);
            }
        });

        return result;
    }

    mapAsts (sources) {
        const result = {};
        //console.log("sources", JSON.stringify(sources))
        Object.entries(sources).forEach(([ sourcePath, { ast } ]) => {
            result[sourcePath] = ast;
        });

        //console.log("mapAsts output: ", JSON.stringify(result))
        return result;
    }

    isIgnorable(sourceMapLocation) {
        const basename = path.basename(this.sourcePath);
        if (!( basename in this.asts)) {
            return false;
        }
        const ast = this.asts[basename];
        const node = srcmap.isVariableDeclaration(sourceMapLocation, ast);
        if (node && srcmap.isDynamicArray(node)) {
            if (this.debug) {
                // this might brealk if logger is none.
                const logger = this.logger || console;
                logger.log('**debug: Ignoring Mythril issue around ' +
                      'dynamically-allocated array.');
            }
            return true;
        } else {
            return false;
        }
    }

    byteOffset2lineColumn(bytecodeOffset, lineBreakPositions) {
        const instNum = this.offset2InstNum[bytecodeOffset];
        const sourceLocation = this.sourceMappingDecoder.atIndex(instNum, this.deployedSourceMap);
        assert(sourceLocation, 'sourceMappingDecoder.atIndex() should not return null');
        const loc = this.sourceMappingDecoder
            .convertOffsetToLineColumn(sourceLocation, lineBreakPositions);

        if (loc.start) {
            loc.start.line++;
        }
        if (loc.end) {
            loc.end.line++;
        }

        const start = loc.start || { line: -1, column: 0 };
        const end = loc.end || {};

        return [start, end];
    }

    textSrcEntry2lineColumn(srcEntry, lineBreakPositions) {
        const ary = srcEntry.split(':');
        const sourceLocation = {
            length: parseInt(ary[1], 10),
            start: parseInt(ary[0], 10),
        };
        const loc = this.sourceMappingDecoder
            .convertOffsetToLineColumn(sourceLocation, lineBreakPositions);
        if (loc.start) {
            loc.start.line++;
        }
        if (loc.end) {
            loc.end.line++;
        }
        return [loc.start, loc.end];
    }

    issue2EsLint(issue, spaceLimited, sourceFormat, sourceName) {
        const esIssue = {
            fatal: false,
            ruleId: issue.swcID,
            message: spaceLimited ? issue.description.head : `${issue.description.head} ${issue.description.tail}`,
            severity: mythx2Severity[issue.severity] || 1,
            mythXseverity: issue.severity,
            line: -1,
            column: 0,
            endLine: -1,
            endCol: 0,
        };

        let startLineCol,  endLineCol;
        const lineBreakPositions = this.lineBreakPositions[sourceName];

        if (sourceFormat === 'evm-byzantium-bytecode') {
            // Pick out first byteCode offset value
            const offset = parseInt(issue.sourceMap.split(':')[0], 10);
            [startLineCol, endLineCol] = this.byteOffset2lineColumn(offset, lineBreakPositions);
        } else if (sourceFormat === 'text') {
            // Pick out first srcEntry value
            const srcEntry = issue.sourceMap.split(';')[0];
            [startLineCol, endLineCol] = this.textSrcEntry2lineColumn(srcEntry, lineBreakPositions);
        }
        if (startLineCol) {
            esIssue.line = startLineCol.line;
            esIssue.column = startLineCol.column;
            esIssue.endLine = endLineCol.line;
            esIssue.endCol = endLineCol.column;
        }

        return esIssue;
    }

    convertMythXReport2EsIssue(report, config, spaceLimited) {
        const { issues, sourceFormat, source } = report;
        const result = {
            errorCount: 0,
            warningCount: 0,
            fixableErrorCount: 0,
            fixableWarningCount: 0,
            filePath: source,
        };
        const sourceName = path.basename(source);
        result.messages = issues
            .map(issue => this.issue2EsLint(issue, spaceLimited, sourceFormat, sourceName))
            .filter(issue => keepIssueInResults(issue, config));

        result.warningCount = result.messages.reduce((acc,  { fatal, severity }) =>
            !isFatal(fatal , severity) ? acc + 1: acc, 0);

        result.errorCount = result.messages.reduce((acc,  { fatal, severity }) =>
            isFatal(fatal , severity) ? acc + 1: acc, 0);

        return result;
    }

    getEslintIssues(config, spaceLimited = false) {
        return this.issues.map(report => this.convertMythXReport2EsIssue(report, config, spaceLimited));
    }
}

function doReport(config, objects, errors, notAnalyzedContracts) {
    let ret = 0;

    // Return true if we shold show log.
    // Ignore logs with log.level "info" unless the "debug" flag
    // has been set.
    function showLog(log) {
        return config.debug || (log.level !== 'info');
    }

    // Return 1 if vulnerabilities were found.
    objects.forEach(ele => {
        ele.issues.forEach(ele => {
            ret = ele.issues.length > 0 ? 1 : ret;
        })
    })

    const spaceLimited = ['tap', 'markdown', 'json'].indexOf(config.style) === -1;
    const eslintIssues = objects
        .map(obj => obj.getEslintIssues(config, spaceLimited))
        .reduce((acc, curr) => acc.concat(curr), []);

    // FIXME: temporary solution until backend will return correct filepath and output.
    const eslintIssuesByBaseName = groupEslintIssuesByBasename(eslintIssues);

    const uniqueIssues = getUniqueIssues(eslintIssuesByBaseName);
    const formatter = getFormatter(config.style);
    const report = formatter(uniqueIssues);
    config.logger.info(report);

    const logGroups = objects.map(obj => { return {'sourcePath': obj.sourcePath, 'logs': obj.logs, 'uuid': obj.uuid};})
          .reduce((acc, curr) => acc.concat(curr), []);

    let haveLogs = false;
    logGroups.some(logGroup => {
        logGroup.logs.some(log => {
            if (showLog(log)) {
                haveLogs = true;
                return;
            }
        });
        if(haveLogs) return;
    });

    if (haveLogs) {
        ret = 1;
        config.logger.info('MythX Logs:');
        logGroups.forEach(logGroup => {
            config.logger.info(`\n${logGroup.sourcePath}`.yellow);
            config.logger.info(`UUID: ${logGroup.uuid}`.yellow);
            logGroup.logs.forEach(log => {
                if (showLog(log)) {
                    config.logger.info(`${log.level}: ${log.msg}`);
                }
            });
        });
    }

    if (errors.length > 0) {
        ret = 2;
        config.logger.error('Internal MythX errors encountered:'.red);
        errors.forEach(err => {
            config.logger.error(err.error || err);
            if (config.debug > 1 && err.stack) {
                config.logger.info(err.stack);
            }
        });
    }

    return ret;
}

function getFormatter(style) {
    const formatterName = style || 'stylish';
    try {
        const frmtr = require(`eslint/lib/formatters/${formatterName}`);
        return frmtr
    } catch (ex) {
        ex.message = `\nThere was a problem loading formatter option: ${style} \nError: ${
            ex.message
        }`;
        throw ex;
    }
}

const groupEslintIssuesByBasename = issues => {
    const path = require('path');
    const mappedIssues = issues.reduce((accum, issue) => {
        const {
            errorCount,
            warningCount,
            fixableErrorCount,
            fixableWarningCount,
            filePath,
            messages,
        } = issue;

        const basename = path.basename(filePath);
        if (!accum[basename]) {
            accum[basename] = {
                errorCount: 0,
                warningCount: 0,
                fixableErrorCount: 0,
                fixableWarningCount: 0,
                filePath: filePath,
                messages: [],
            };
        }
        accum[basename].errorCount += errorCount;
        accum[basename].warningCount += warningCount;
        accum[basename].fixableErrorCount += fixableErrorCount;
        accum[basename].fixableWarningCount += fixableWarningCount;
        accum[basename].messages = accum[basename].messages.concat(messages);
        return accum;
    }, {});

    const issueGroups = Object.values(mappedIssues);
    for (const group of issueGroups) {
        group.messages = group.messages.sort(function(mess1, mess2) {
            return compareMessLCRange(mess1, mess2);
        });

    }
    return issueGroups;
};

function compareMessLCRange(mess1, mess2) {
    const c = compareLineCol(mess1.line, mess1.column, mess2.line, mess2.column);
    return c != 0 ? c : compareLineCol(mess1.endLine, mess1.endCol, mess2.endLine, mess2.endCol);
}

function compareLineCol(line1, column1, line2, column2) {
    return line1 === line2 ?
        (column1 - column2) :
        (line1 - line2);
}

module.exports = {
    MythXIssues,
    keepIssueInResults,
    getUniqueIssues,
    getUniqueMessages,
    isFatal,
    doReport
};
