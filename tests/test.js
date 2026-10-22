

async function test() {
    try {
        const res = await fetch("http://localhost:3001/api/quiz", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ topicsToFocus: ["Math"], difficulty: "mixed" })
        });
        const text = await res.text();
        console.log("Status:", res.status);
        console.log("Body:", text);
    } catch (err) {
        console.error(err);
    }
}
test();
