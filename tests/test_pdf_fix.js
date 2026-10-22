const { PDFParse } = require('pdf-parse');
async function test() {
    try {
        const buffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
        const parser = new PDFParse(new Uint8Array(buffer));
        const result = await parser.getText();
        console.log("Success:", result.text);
    } catch(err) {
        console.error("Error:", err.message);
    }
}
test();
