const cvUpload = document.getElementById('cv-upload');
const jobSpec = document.getElementById('job-spec');
const submitBtn = document.getElementById('submit-btn');
const downloadBtn = document.getElementById('download-btn');
const cvOutput = document.getElementById('cv-output');
const apiKeyInput = document.getElementById('api-key');


submitBtn.addEventListener('click', async () => {
    const cvFile = cvUpload.files[0];
    const jobSpecText = jobSpec.value;
    const apiKey = apiKeyInput.value.trim();

    if (!cvFile || !jobSpecText) {
        alert('Please upload a CV and paste a job spec.');
        return;
    }

    try {
        const cvText = await readFileAsText(cvFile);
        const prompt = generatePrompt(cvText, jobSpecText);

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4-turbo-2024-04-09',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a CV reviewer. Your role is to critically evaluate how well a CV matches a specific job specification and the company culture and requirements. You provide detailed feedback and an alignment score out of 100, explaining the reasons for the score. Additionally, You offer suggestions on how to amend the CV based on the feedback to better align it with the job requirements. Finally you provide a rewritten professional summary to better align to the role. Your goal is to help users refine their CVs to increase their chances of landing their desired job.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 1,
                max_tokens: 2056,
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0,
                stream: true
            })
        });

        if (response.ok) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let generatedCV = '';
        
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
        
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');
        
                for (const line of lines) {
                    if (line.trim() === 'data: [DONE]') {
                        break;
                    }
        
                    if (line.startsWith('data:')) {
                        const data = JSON.parse(line.slice(5));
                        if (data.choices && data.choices.length > 0 && data.choices[0].delta.content) {
                            const content = data.choices[0].delta.content;
                            generatedCV += content;
                            cvOutput.textContent = generatedCV;
                        }
                    }
                }
            }
        
            console.log('Generated CV:', generatedCV);
        } else {
            console.error('API request failed with status:', response.status);
            alert('The API request failed. Please check the console for more details.');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred while generating the CV. Please check the console for more details.');
    }
});

downloadBtn.addEventListener('click', () => {
    const generatedCV = cvOutput.textContent;
    const blob = new Blob([generatedCV], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'generated_cv.txt';
    link.click();
    URL.revokeObjectURL(url);
});

async function readFileAsText(file) {
    if (file.type === 'application/pdf') {
        return await readPDFFile(file);
    } else {
        return await readTextFile(file);
    }
}

async function readPDFFile(file) {
    const pdf = await pdfjsLib.getDocument(URL.createObjectURL(file)).promise;
    let text = '';

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(item => item.str).join(' ');
    }

    return text;
}

function readTextFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            resolve(reader.result);
        };
        reader.onerror = reject;
        reader.readAsText(file);
    });
}


function generatePrompt(cvText, jobSpecText) {
    return `Please take the CV and job specification that I have provided and provide an alignment score out of 100, explaining the reasons for the score. Additionally, offer suggestions on how to amend the CV based on the feedback to better align it with the job requirements. Also, provide a rewritten professional summary to better align to the role. Any output needs to be written in British English.
CV:
${cvText}

Job Specification:
${jobSpecText}

Generated CV:
`;

}
