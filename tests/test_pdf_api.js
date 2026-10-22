const pdf = require('pdf-parse');
async function test() {
    const buffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
    try {
        if (typeof pdf === 'function') {
            console.log('pdf is function');
            const data = await pdf(buffer);
            console.log(data);
        } else if (typeof pdf.default === 'function') {
            console.log('pdf.default is function');
            const data = await pdf.default(buffer);
            console.log(data);
        } else if (typeof pdf.PDFParse === 'function') {
            console.log('pdf.PDFParse is function');
            // might be a class or a function, but usually pdf-parse exports a function that returns a promise.
            // maybe we can check what pdf.PDFParse is.
            console.log('PDFParse type:', typeof pdf.PDFParse);
        }
    } catch (err) {
        console.error(err);
    }
}
test();
