let map = null;

document.getElementById('update-map').addEventListener('click', () => {
    const apiKey = document.getElementById('api-key').value;
    
    if (apiKey) {
      mapboxgl.accessToken = apiKey;
      
      if (!map) {
        map = new mapboxgl.Map({
          container: 'map',
          style: 'mapbox://styles/mapbox/dark-v11',
          center: [-0.118092, 51.509865], // Central London
          zoom: 10 // Initial zoom level
        });
        
        map.on('click', onMapClick);
      }
      
      if (marker) {
        const lngLat = marker.getLngLat();
        updateIsochrone(lngLat);
      } else {
        alert('Please click on the map to place a marker and see catchments.');
      }
    } else {
      alert('Please enter a valid Mapbox API key.');
    }
  });

// Add this code after initializing the map
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');

searchButton.addEventListener('click', () => {
  const query = searchInput.value;
  geocodeQuery(query);
});

function geocodeQuery(query) {
  const apiKey = document.getElementById('api-key').value;
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${apiKey}`;

  fetch(url)
    .then(response => response.json())
    .then(data => {
      if (data.features.length > 0) {
        const firstResult = data.features[0];
        const lngLat = {
          lng: firstResult.center[0],
          lat: firstResult.center[1]
        };
        map.flyTo({
          center: lngLat,
          zoom: 12
        });
        if (marker) {
          marker.remove();
        }
        marker = new mapboxgl.Marker().setLngLat(lngLat).addTo(map);
        updateIsochrone(lngLat);
      } else {
        alert('No results found.');
      }
    })
    .catch(error => {
      console.error('Error:', error);
      alert('An error occurred while geocoding.');
    });
}

let marker = null;
let isochrone = null;
let outputAreas = null;
let outputAreaCentroids = null;
let censusFeatures = null;


function loadCensusFeatures() {
    fetch('min_census_features.csv')
        .then(response => response.text())
        .then(data => {
            const features = [];
            // Normalize line endings and then split into lines
            const lines = data.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
            const headers = lines[0].split(',');
            lines.slice(1).forEach(line => {
                const values = line.split(',');
                const properties = {};
                headers.forEach((header, index) => {
                    let value = values[index];
                    if (header === 'geography') {
                        // Remove escape characters and double quotes from the geography column
                        value = value.replace(/\\"/g, '');
                    }
                    properties[header] = value;
                });
                features.push(properties);
            });
            censusFeatures = features;
            console.log(censusFeatures);    
        })
        .catch(error => logError(error, 'Error loading census features.'));
}

// Enhanced error logging function
function logError(error, message) {
  console.error(message, error);
  alert(message); // Optionally alert the user
}

function onMapClick(event) {
  const lngLat = event.lngLat;

  if (marker) {
    marker.remove();
  }

  marker = new mapboxgl.Marker().setLngLat(lngLat).addTo(map);

  updateIsochrone(lngLat);
}

function updateIsochrone(lngLat) {
  const apiKey = document.getElementById('api-key').value;
  const driveTime = document.getElementById('drive-time').value;
  //const driveTime = 20;

  fetch(`https://api.mapbox.com/isochrone/v1/mapbox/driving/${lngLat.lng},${lngLat.lat}?contours_minutes=${driveTime}&polygons=true&access_token=${apiKey}`)
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to fetch isochrone data');
      }
      return response.json();
    })
    .then(data => {
      if (data.features.length === 0) {
        throw new Error('No isochrone data returned');
      }
      isochrone = data;
      if (map.getLayer('isochrone')) {
        map.removeLayer('isochrone');
        map.removeSource('isochrone');
      }
       map.addLayer({
         id: 'isochrone',
         type: 'fill',
         source: {
           type: 'geojson',
           data: data
         },
         paint: {
           'fill-color': '#00766f',
           'fill-opacity': 0.5
         }
       });
    const bounds = turf.bbox(data);
    map.fitBounds(bounds, { padding: 50 });
      updateOutputAreas();
    })
    .catch(error => logError(error, 'Error fetching or processing isochrone data.'));
}
proj4.defs("EPSG:27700", "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs");


function loadOutputAreaCentroids() {
    fetch('oapwc.csv')
      .then(response => response.text())
      .then(data => {
        const features = [];
        const lines = data.split('\n');
        lines.slice(1).forEach(line => {
          const [FID, OA21CD, GlobalID, x, y] = line.split(',');
          const xCoord = parseFloat(x);
          const yCoord = parseFloat(y);
          
          // Check if coordinates are valid numbers
          if (!isNaN(xCoord) && !isNaN(yCoord)) {
            const [lng, lat] = proj4('EPSG:27700', 'EPSG:4326', [xCoord, yCoord]);
            features.push({
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [lng, lat]
              },
              properties: {
                FID,
                OA21CD,
                GlobalID
              }
            });
          } else {
            console.warn(`Invalid coordinates for FID: ${FID}, OA21CD: ${OA21CD}`);
          }
        });
        outputAreaCentroids = {
          type: 'FeatureCollection',
          features
        };
        if (map) {
            updateOutputAreas();
          }
      })
      .catch(error => logError(error, 'Error loading output area centroids.'));
  }

  function updateOutputAreas() {
    if (!isochrone || !outputAreaCentroids) return;
  
    const intersectingCentroids = turf.pointsWithinPolygon(outputAreaCentroids, isochrone);
    outputAreas = intersectingCentroids;
  
    const intersectingOACodes = intersectingCentroids.features.map(feature => feature.properties.OA21CD);
  
    if (!map.getLayer('output-areas')) {
      map.addLayer({
        id: 'output-areas',
        type: 'fill',
        source: {
          type: 'vector',
          url: 'mapbox://tahmed.67lv0km2'
        },
        'source-layer': 'Output_Areas_Dec_2021_Boundar-dp2i2i',
        paint: {
          'fill-color': '#00766f',
          'fill-opacity': 0.3
        }
      });
    }
  
    map.setFilter('output-areas', ['in', 'OA21CD', ...intersectingOACodes]);
    
    updateSummaryStats(outputAreas);
  }



function updateSummaryStats(outputAreas) {
    const summaryStats = document.getElementById('summary-stats');
    summaryStats.innerHTML = '';
  
    const intersectingOAs = outputAreas.features.map(feature => feature.properties.OA21CD);
    const filteredFeatures = censusFeatures.filter(feature => intersectingOAs.includes(feature.geography));
  
    const totalOAs = outputAreas.features.length;
    const intersectingOAsCount = filteredFeatures.length;
  
    if (filteredFeatures.length > 0) {
      const weightedAverageAgeSum = filteredFeatures.reduce((sum, feature) => sum + parseFloat(feature['Weighted_Average_Age'] || 0), 0);
      const weightedAverageAgeMean = weightedAverageAgeSum / filteredFeatures.length;
  
      const weightedAverageDeprivationSum = filteredFeatures.reduce((sum, feature) => sum + parseFloat(feature['Weighted_Average_Deprivation'] || 0), 0);
      const weightedAverageDeprivationMean = weightedAverageDeprivationSum / filteredFeatures.length;
  
      const weightedAverageCarsSum = filteredFeatures.reduce((sum, feature) => sum + parseFloat(feature['Weighted_Average_Cars'] || 0), 0);
      const weightedAverageCarsMean = weightedAverageCarsSum / filteredFeatures.length;
  
      const sumByEthnicity = {
        'White': filteredFeatures.reduce((sum, feature) => sum + parseFloat(feature['Ethnic.group|White'] || 0), 0),
        'Asian': filteredFeatures.reduce((sum, feature) => sum + parseFloat(feature['Ethnic.group|Asian|Asian.British.or.Asian.Welsh'] || 0), 0),
        'Black': filteredFeatures.reduce((sum, feature) => sum + parseFloat(feature['Ethnic.group|Black|Black.British|Black.Welsh|Caribbean.or.African'] || 0), 0)
      };
  
      const sumByHousingType = {
        'Detached': filteredFeatures.reduce((sum, feature) => sum + parseFloat(feature['Accommodation.type|Detached'] || 0), 0),
        'Semi-detached': filteredFeatures.reduce((sum, feature) => sum + parseFloat(feature['Accommodation.type|Semi.detached'] || 0), 0),
        'Terraced': filteredFeatures.reduce((sum, feature) => sum + parseFloat(feature['Accommodation.type|Terraced'] || 0), 0)
      };
  
      const totalEthnicity = filteredFeatures.reduce((sum, feature) => sum + parseFloat(feature['Ethnic.group|Total|All.usual.residents'] || 0), 0);
      const totalHousingType = filteredFeatures.reduce((sum, feature) => sum + parseFloat(feature['Accommodation.type|Total|All.households'] || 0), 0);
  
      const percentageByEthnicity = {
        'White': ((sumByEthnicity['White'] / totalEthnicity) * 100).toFixed(2),
        'Asian': ((sumByEthnicity['Asian'] / totalEthnicity) * 100).toFixed(2),
        'Black': ((sumByEthnicity['Black'] / totalEthnicity) * 100).toFixed(2)
      };
  
      const percentageByHousingType = {
        'Detached': ((sumByHousingType['Detached'] / totalHousingType) * 100).toFixed(2),
        'Semi-detached': ((sumByHousingType['Semi-detached'] / totalHousingType) * 100).toFixed(2),
        'Terraced': ((sumByHousingType['Terraced'] / totalHousingType) * 100).toFixed(2)
      };

      const sumByTenure = {
        'Owned': filteredFeatures.reduce((sum, feature) => sum + parseFloat(feature['Tenure.of.household|Owned'] || 0), 0),
        'Social Rented': filteredFeatures.reduce((sum, feature) => sum + parseFloat(feature['Tenure.of.household|Social.rented'] || 0), 0),
        'Private Rented': filteredFeatures.reduce((sum, feature) => sum + parseFloat(feature['Tenure.of.household|Private.rented'] || 0), 0),
        'Lives Rent Free': filteredFeatures.reduce((sum, feature) => sum + parseFloat(feature['Tenure.of.household|Lives.rent.free'] || 0), 0)
      };
  
      const sumByTravelToWork = {
        'Driving a Car or Van': filteredFeatures.reduce((sum, feature) => sum + parseFloat(feature['Method.of.travel.to.workplace|Driving.a.car.or.van'] || 0), 0),
        'Work Mainly at or from Home': filteredFeatures.reduce((sum, feature) => sum + parseFloat(feature['Method.of.travel.to.workplace|Work.mainly.at.or.from.home'] || 0), 0)
      };
  
      const sumByQualification = {
        'No Qualifications': filteredFeatures.reduce((sum, feature) => sum + parseFloat(feature['Highest.level.of.qualification|No.qualifications'] || 0), 0),
        'Level 4 Qualifications and Above': filteredFeatures.reduce((sum, feature) => sum + parseFloat(feature['Highest.level.of.qualification|Level.4.qualifications.and.above'] || 0), 0)
      };
  
      const totalTenure = filteredFeatures.reduce((sum, feature) => sum + parseFloat(feature['Tenure.of.household|Total|All.households'] || 0), 0);
      const totalTravelToWork = filteredFeatures.reduce((sum, feature) => sum + parseFloat(feature['Method.of.travel.to.workplace|Total|All.usual.residents.aged.16.years.and.over.in.employment.the.week.before.the.census'] || 0), 0);
      const totalQualification = filteredFeatures.reduce((sum, feature) => sum + parseFloat(feature['Highest.level.of.qualification|Total|All.usual.residents.aged.16.years.and.over'] || 0), 0);
  
      const totalPopulation = filteredFeatures.reduce((sum, feature) => sum + parseFloat(feature['Highest.level.of.qualification|Total|All.usual.residents.aged.16.years.and.over'] || 0), 0);

      const percentageByTenure = {
        'Owned': ((sumByTenure['Owned'] / totalTenure) * 100).toFixed(2),
        'Social Rented': ((sumByTenure['Social Rented'] / totalTenure) * 100).toFixed(2),
        'Private Rented': ((sumByTenure['Private Rented'] / totalTenure) * 100).toFixed(2),
        'Lives Rent Free': ((sumByTenure['Lives Rent Free'] / totalTenure) * 100).toFixed(2)
      };
  
      const percentageByTravelToWork = {
        'Driving a Car or Van': ((sumByTravelToWork['Driving a Car or Van'] / totalTravelToWork) * 100).toFixed(2),
        'Work Mainly at or from Home': ((sumByTravelToWork['Work Mainly at or from Home'] / totalTravelToWork) * 100).toFixed(2)
      };
  
      const percentageByQualification = {
        'No Qualifications': ((sumByQualification['No Qualifications'] / totalQualification) * 100).toFixed(2),
        'Level 4 Qualifications and Above': ((sumByQualification['Level 4 Qualifications and Above'] / totalQualification) * 100).toFixed(2)
      };
  
      const summaryText = `
        <p>Total Output Areas: ${totalOAs}</p>
        <p>Total Population: ${totalPopulation}</p>
        <p>Average Age: ${weightedAverageAgeMean.toFixed(2)}</p>
        <p>Average Deprivation: ${weightedAverageDeprivationMean.toFixed(2)}</p>
        <p>Average Cars: ${weightedAverageCarsMean.toFixed(2)}</p>
        <p>Sum by Ethnicity:</p>
        <ul>
          <li>White: ${sumByEthnicity['White']} (${percentageByEthnicity['White']}%)</li>
          <li>Asian: ${sumByEthnicity['Asian']} (${percentageByEthnicity['Asian']}%)</li>
          <li>Black: ${sumByEthnicity['Black']} (${percentageByEthnicity['Black']}%)</li>
        </ul>
        <p>Sum by Housing Type:</p>
        <ul>
          <li>Detached: ${sumByHousingType['Detached']} (${percentageByHousingType['Detached']}%)</li>
          <li>Semi-detached: ${sumByHousingType['Semi-detached']} (${percentageByHousingType['Semi-detached']}%)</li>
          <li>Terraced: ${sumByHousingType['Terraced']} (${percentageByHousingType['Terraced']}%)</li>
        </ul>
        <p>Sum by Tenure:</p>
      <ul>
        <li>Owned: ${sumByTenure['Owned']} (${percentageByTenure['Owned']}%)</li>
        <li>Social Rented: ${sumByTenure['Social Rented']} (${percentageByTenure['Social Rented']}%)</li>
        <li>Private Rented: ${sumByTenure['Private Rented']} (${percentageByTenure['Private Rented']}%)</li>
        <li>Lives Rent Free: ${sumByTenure['Lives Rent Free']} (${percentageByTenure['Lives Rent Free']}%)</li>
      </ul>

      <p>Sum by Commute:</p>
      <ul>
        <li>Driving: ${sumByTravelToWork['Driving a Car or Van']} (${percentageByTravelToWork['Driving a Car or Van']}%)</li>
        <li>Work from Home: ${sumByTravelToWork['Work Mainly at or from Home']} (${percentageByTravelToWork['Work Mainly at or from Home']}%)</li>
      </ul>

      <p>Sum by Qualification:</p>
      <ul>
        <li>None: ${sumByQualification['No Qualifications']} (${percentageByQualification['No Qualifications']}%)</li>
        <li>Degree: ${sumByQualification['Level 4 Qualifications and Above']} (${percentageByQualification['Level 4 Qualifications and Above']}%)</li>
      </ul>
      `;
  
      summaryStats.innerHTML = summaryText;
    } else {
      summaryStats.innerHTML = `
        <p>Total Output Areas: ${totalOAs}</p>
        <p>No intersecting output areas found.</p>
      `;
    }
  }


loadCensusFeatures();
loadOutputAreaCentroids();
