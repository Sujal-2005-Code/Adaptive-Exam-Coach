async function run() {
    try {
        const regRes = await fetch('http://localhost:3000/api/register', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username: 'testuser_' + Date.now(), email: 'test_' + Date.now() + '@test.com', password: 'password123', grade: '9th', targetExam: 'None'})
        });
        const regData = await regRes.json();
        const token = regData.token;

        const formData = new FormData();
        const fileData = new Blob(['fake image data'], { type: 'image/png' });
        formData.append('syllabus', fileData, 'test.png');

        const uploadRes = await fetch('http://localhost:3000/api/profile/syllabus', {
            method: 'POST',
            headers: {'Authorization': 'Bearer ' + token},
            body: formData
        });
        console.log('Upload status:', uploadRes.status);
    } catch (err) {
        console.error(err);
    }
}
run();
