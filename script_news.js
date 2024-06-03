const searchButton = document.getElementById('searchButton');
const apiKeyInput = document.getElementById('apiKeyInput');
const searchInput = document.getElementById('searchInput');
const resultsDiv = document.getElementById('results');

searchButton.addEventListener('click', searchNews);

function searchNews() {
    const apiKey = apiKeyInput.value;
    const companyName = searchInput.value;
    const url = `https://cors-anywhere.herokuapp.com/https://newsapi.org/v2/everything?q=${encodeURIComponent(companyName)}&apiKey=${apiKey}`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            resultsDiv.innerHTML = '';
            data.articles.forEach(article => {
                const articleDiv = document.createElement('div');
                articleDiv.classList.add('article');
                articleDiv.innerHTML = `
                    <h3>${article.title}</h3>
                    <p>${article.description}</p>
                    <a href="${article.url}" target="_blank">Read More</a>
                `;
                resultsDiv.appendChild(articleDiv);
            });
        })
        .catch(error => {
            console.error('Error:', error);
        });
}
