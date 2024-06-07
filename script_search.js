const form = document.getElementById('searchForm');
const resultsDiv = document.getElementById('results');
 
form.addEventListener('submit', (event) => {
    event.preventDefault();
 
    const apiKey = document.getElementById('apiKey').value;
    const companyUrl = document.getElementById('companyUrl').value;
    const country = document.getElementById('country').value;
    const jobTitle = document.getElementById('jobTitle').value;
 
    const apiUrl = 'https://api.coresignal.com/cdapi/v1/linkedin/member/search/filter';
    const data = {
        "experience_company_linkedin_url": companyUrl,
        "active_experience": true,
        "skill": jobTitle,
        "country": `(${country})`
    };
    const customHeaders = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
    };
 
    fetch(apiUrl, {
        method: 'POST',
        headers: customHeaders,
        body: JSON.stringify(data)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        if (!response.headers.get('Content-Type').includes('application/json')) {
            throw new Error('Response is not in JSON format');
        }
        return response.json();
    })
    .then(data => {
        resultsDiv.innerHTML = '';
        if (data.length > 0) {
            data.forEach(result => {
                const resultDiv = document.createElement('div');
                resultDiv.textContent = `Name: ${result.name}, Job Title: ${result.title}, Company: ${result.company}`;
                resultsDiv.appendChild(resultDiv);
            });
        } else {
            resultsDiv.textContent = 'No results found.';
        }
    })
    .catch(error => {
        console.error('Error:', error);
        resultsDiv.textContent = 'Error occurred while fetching data.';
    });
});
