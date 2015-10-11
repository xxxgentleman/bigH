var fs = require('fs'),
    States = {},
    selfClosingTagList = ['area', 'base', 'br', 'col', 'command', 'embed', 'hr', 'img', 'input', 'keygen', 'link', 'meta', 'param', 'source', 'track', 'wbr'],
    Reader, Scanner, Parser, bigH;

States.START_STATE = 0;         // ªì©lª¬ºA
States.STRING_STATE = 1;		// ¦r¦ê
States.COMMENT_STATE = 2;		// µùÄÀ
States.IDENTIFIER_STATE = 3;    // ÃÑ§O¦r

Reader = function (string) {
    var data = string,
		currentPosition = 0,
		dataLength = data.length;

    return {
        nextCharacter: function () {
            if (currentPosition >= dataLength) {
                return '-1';
            };

            currentPosition += 1;

            return data.charAt(currentPosition - 1);
        },

        retract: function () {
            currentPosition -= 1;

            if (currentPosition >= dataLength) {
                return;
            };

            if (currentPosition < 0) {
                currentPosition = 0;
            };
        }
    };
};

Scanner = function (reader) {
    var nextCharacter = reader.nextCharacter,
        retract = reader.retract,
        currentLine = 1,
        state = States.START_STATE;

    return function () {
        var bufferString = '',
            character;

        while (true) {
            switch (state) {
                case States.START_STATE:
                    character = nextCharacter();

                    switch (character) {
                        case '-1': case ',': case ':': case '(': case ')': case '{': case '}':
                            return { type: 'separator', text: character };
                        case '\r': case '\n':
                            currentLine += 1;
                            break;
                        case "'": case '"':
                            state = States.STRING_STATE;
                            bufferString = character;
                            break;
                        case '#':
                            state = States.COMMENT_STATE;
                            bufferString = character;
                            break;
                        default:
                            if (!/\s/.test(character)) {
                                state = States.IDENTIFIER_STATE;
                                bufferString = character;
                            };
                    };

                    break;
                case States.STRING_STATE:
                    var stringType = bufferString === "'" ? "'" : '"';

                    character = nextCharacter();

                    while (character !== stringType) {
                        bufferString += character;
                        character = nextCharacter();
                    };

                    bufferString += character;
                    state = States.START_STATE;

                    return { type: 'string', text: bufferString };
                case States.COMMENT_STATE:
                    character = nextCharacter();

                    while (character !== '\r' && character !== '\n' && character !== '-1') {
                        bufferString += character;

                        if (character === '#') {
                            break;
                        };

                        character = nextCharacter();
                    };

                    state = States.START_STATE;

                    return { type: 'comment', text: bufferString };
                case States.IDENTIFIER_STATE:
                    character = nextCharacter();

                    while (/[^\,\:\(\)\{\}\"\'\#\r\n\s]/.test(character)) {
                        bufferString += character;
                        character = nextCharacter();
                    };

                    retract();
                    state = States.START_STATE;

                    return { type: 'identifier', text: bufferString };
                default:
            };
        };
    };
};

Parser = function (scanner, jsData) {
    var nextToken = scanner,
        consumed = true,
        advance, lookAhead, currentToken, aheadToken, parseTag, parseObj;

    advance = function () {
        if (consumed) {
            var token = nextToken();

            while (token.type === 'comment') {
                token = nextToken();
            };

            currentToken = token;
        } else {
            currentToken = aheadToken;
            consumed = true;
        };

        currentType = currentToken.type;
        currentText = currentToken.text;
    };

    lookAhead = function (prop) {
        if (consumed) {
            var token = nextToken();

            while (token.type === 'comment') {
                token = nextToken();
            };

            aheadToken = token;
            consumed = false;
        };

        return (prop === 'type') ? aheadToken.type : aheadToken.text;
    };

    parseTag = function () {
        var tag = '',
            parsedString = '',
            first = true;

        while (true) {
            switch (lookAhead('type')) {
                case 'identifier':
                    if (parsedString === '') {
                        advance();
                        tag += currentText;

                        if (tag === 'html') {
                            parsedString += '<!DOCTYPE html>';
                        };
                    } else {
                        parsedString += parseTag();
                        first = false;
                    };

                    continue;
                case 'string':
                    advance();
                    parsedString += currentText.slice(1, -1);
                    continue;
                case 'separator':
                    switch (lookAhead('text')) {
                        case '{':
                            advance();
                            parsedString += parseObj(tag);
                            continue;
                        case '}':
                            advance();

                            if (selfClosingTagList.indexOf(tag) === -1) {
                                parsedString += '>';
                            };

                            continue;
                        case '(':
                            advance();

                            if (lookAhead('text') === '{') {
                                parsedString += '<' + tag;
                            } else {
                                parsedString += '<' + tag + '>';
                            };

                            continue;
                        case ',':
                            advance();

                            if (first) {
                                parsedString += '>' + parseTag();
                                first = false;
                            } else {
                                parsedString += parseTag();
                            };

                            continue;
                        case ')':
                            advance();

                            if (selfClosingTagList.indexOf(tag) === -1) {
                                if (tag === 'body') {
                                    parsedString += '<script>' + jsData + '</script>' + '</' + tag + '>';
                                } else {
                                    parsedString += '</' + tag + '>';
                                };
                            } else {
                                parsedString += ' />';
                            };

                            return parsedString;
                        default:
                    };
                default:
            };
        };
    };

    parseObj = function (tag) {
        var parsedObj = ' ';

        while (true) {
            switch (lookAhead('type')) {
                case 'identifier':
                    advance();

                    if (currentText === 'true') {
                        if (lookAhead('text') !== '}') {
                            parsedObj += ' ';
                        };
                    } else {
                        parsedObj += currentText;
                    };

                    continue;
                case 'separator':
                    switch (lookAhead('text')) {
                        case ':':
                            advance();
                            
                            if (lookAhead('text') !== 'true') {
                                parsedObj += '=';
                            };

                            continue;
                        case ',':
                            advance();
                            parsedObj += ' ';
                            continue;
                        case '}':
                            return parsedObj;
                        default:
                    };
                case 'string':
                    advance();
                    parsedObj += currentText.replace(/\'/g, '"');
                    continue;
                default:
            };
        };
    };

    return parseTag();
};

bigH = function (fileName) {
    var bhData = fs.readFileSync('./views/' + fileName + '.bh', 'utf8'),
        jsData = fs.readFileSync('./views/' + fileName + '.js', 'utf8');

    return Parser(Scanner(Reader(bhData)), jsData);
};

module.exports = bigH;