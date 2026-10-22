const str = '{"e": "\\(x^3 - a^3 = (x-a)(x^2+ax+a^2)\\)"}';
try {
    console.log("Original parse:", JSON.parse(str));
} catch (e) {
    console.log("Parse failed as expected:", e.message);
}

const fixedStr = str.replace(/\\(?=[^"\\/bfnrtu])/g, '\\\\');
console.log("Fixed string:", fixedStr);
try {
    console.log("Fixed parse:", JSON.parse(fixedStr));
} catch (e) {
    console.log("Fixed parse failed:", e.message);
}
