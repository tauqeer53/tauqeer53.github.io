let map = null;
let marker = null;
let isochrone = null;
let outputAreas = null;
let outputAreaCentroids = null;
let censusFeatures = null;

let isIsochroneVisible = true;
let areOutputAreasVisible = true;

const supergroupColors = {
  "Multicultural Metropolitans": "#E9730C",
  "Ethnicity Central": "#F755C9",
  "Constrained City Dwellers": "#F5D423",
  "Hard-Pressed Living": "#786EB6",
  "Cosmopolitans": "#1C76FD",
  "Urbanites": "#FF5C67",
  "Suburbanites": "#8BB340",
  "Rural Residents": "#42E8E0"
};

// Load data
loadCensusFeatures();
loadOutputAreaCentroids();

document.getElementById('toggle-isochrone').addEventListener('click', toggleIsochrone);
document.getElementById('toggle-output-areas').addEventListener('click', toggleOutputAreas);
document.getElementById('isochrone-type').addEventListener('change', updateIsochroneUnit);

function updateIsochroneUnit() {
    const isochroneType = document.getElementById('isochrone-type').value;
    const isochroneUnit = document.getElementById('isochrone-unit');
    isochroneUnit.textContent = isochroneType === 'time' ? 'minutes' : 'miles';
}

function toggleIsochrone() {
  isIsochroneVisible = !isIsochroneVisible;
  if (map.getLayer('isochrone')) {
      map.setLayoutProperty('isochrone', 'visibility', isIsochroneVisible ? 'visible' : 'none');
  }
  document.getElementById('toggle-isochrone').textContent = isIsochroneVisible ? 'Hide Isochrone' : 'Show Isochrone';
}

function toggleOutputAreas() {
  areOutputAreasVisible = !areOutputAreasVisible;
  if (map.getLayer('output-areas')) {
      map.setLayoutProperty('output-areas', 'visibility', areOutputAreasVisible ? 'visible' : 'none');
  }
  document.getElementById('toggle-output-areas').textContent = areOutputAreasVisible ? 'Hide Output Areas' : 'Show Output Areas';
}

document.getElementById('update-map').addEventListener('click', () => {
    const apiKey = document.getElementById('mapbox-api-key').value;
    
    if (apiKey) {
        mapboxgl.accessToken = apiKey;
        
        if (!map) {
            try {
                map = new mapboxgl.Map({
                    container: 'map',
                    style: 'mapbox://styles/mapbox/satellite-streets-v12', // Changed to light style
                    center: [-0.118092, 51.509865], // Central London
                    zoom: 10 // Initial zoom level
                });
                
                map.on('load', () => {
                    console.log('Map loaded successfully');
                    map.on('click', onMapClick);
                });

                map.on('error', (e) => {
                    console.error('Map error:', e);
                    alert('An error occurred while loading the map. Please check your API key and try again.');
                });
            } catch (error) {
                console.error('Error initializing map:', error);
                alert('Failed to initialize the map. Please check your API key and try again.');
                return;
            }
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

const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');

searchButton.addEventListener('click', () => {
    const query = searchInput.value;
    geocodeQuery(query);
});

function geocodeQuery(query) {
    const apiKey = document.getElementById('mapbox-api-key').value;
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

function loadCensusFeatures() {
  Promise.all([
      fetch('first_half.csv').then(response => response.text()),
      fetch('second_half.csv').then(response => response.text())
  ])
  .then(([data1, data2]) => {
      const combinedData = data1 + '\n' + data2.split('\n').slice(1).join('\n');
      const features = [];
      // Normalize line endings and then split into lines
      const lines = combinedData.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
      const headers = lines[0].split(',');
      lines.slice(1).forEach(line => {
          if (line.trim() === '') return; // Skip empty lines
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
      console.log('Census Features Sample:', censusFeatures.slice(0, 5));
  })
  .catch(error => logError(error, 'Error loading census features.'));
}

function logError(error, message) {
    console.error(message, error);
    alert(message);
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
  const apiKey = document.getElementById('mapbox-api-key').value;
  const isochroneType = document.getElementById('isochrone-type').value;
  const isochroneValue = parseFloat(document.getElementById('isochrone-value').value);

  if (isochroneType === 'time') {
      // Time-based isochrone using Mapbox API
      const url = `https://api.mapbox.com/isochrone/v1/mapbox/driving/${lngLat.lng},${lngLat.lat}?contours_minutes=${isochroneValue}&polygons=true&access_token=${apiKey}`;

      fetch(url)
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
              addIsochroneToMap(data);
          })
          .catch(error => {
              console.error('Error fetching or processing isochrone data:', error);
              alert('Error fetching or processing isochrone data. Please try again.');
          });
  } else {
      // Distance-based isochrone using Turf.js
      const radius = isochroneValue * 1609.34; // Convert miles to meters
      const options = {steps: 64, units: 'meters'};
      const circle = turf.circle([lngLat.lng, lngLat.lat], radius, options);
      
      const circleFeatureCollection = {
          type: 'FeatureCollection',
          features: [circle]
      };

      addIsochroneToMap(circleFeatureCollection);
  }
}

function addIsochroneToMap(data) {
  try {
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
        },
        layout: {
            visibility: isIsochroneVisible ? 'visible' : 'none'
        }
    });
    const bounds = turf.bbox(data);
    map.fitBounds(bounds, { padding: 50 });
    updateOutputAreas();
  } catch (error) {
    console.error('Error adding isochrone to map:', error);
    alert('Error adding isochrone to map. Please try again.');
  }
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
            console.log('Output Area Centroids Sample:', outputAreaCentroids.features.slice(0, 5));
        })
        .catch(error => logError(error, 'Error loading output area centroids.'));
}

// Add this at the top of your script, outside of any function
let currentPopup = null;

function updateOutputAreas() {
  if (!isochrone || !outputAreaCentroids || !censusFeatures) {
      console.log('Missing data:', { isochrone: !!isochrone, outputAreaCentroids: !!outputAreaCentroids, censusFeatures: !!censusFeatures });
      return;
  }

  try {
      const intersectingCentroids = turf.pointsWithinPolygon(outputAreaCentroids, isochrone);
      outputAreas = intersectingCentroids;
      const intersectingOACodes = intersectingCentroids.features.map(feature => feature.properties.OA21CD);

      console.log('Intersecting OA Codes Sample:', intersectingOACodes.slice(0, 5));

      // Create a mapping of OA codes to Supergroup Names, Group Names, and Subgroup Names
      const oaInfoMap = {};
      censusFeatures.forEach(feature => {
          if (intersectingOACodes.includes(feature.geography)) {
              oaInfoMap[feature.geography] = {
                  supergroupName: feature['Supergroup Name'],
                  groupName: feature['Group Name'],
                  subgroupName: feature['Subgroup Name']
              };
          }
      });

      console.log('OA Info Map Sample:', Object.entries(oaInfoMap).slice(0, 5));

      // Get unique Supergroup Names
      const uniqueSupergroups = [...new Set(Object.values(oaInfoMap).map(info => info.supergroupName))];
      console.log('Unique Supergroups:', uniqueSupergroups);

      // Create a color scale for the unique Supergroup Names
      const colorScale = d3.scaleOrdinal()
      .domain(Object.keys(supergroupColors))
      .range(Object.values(supergroupColors));

      const layerConfig = {
          id: 'output-areas',
          type: 'fill',
          source: {
              type: 'vector',
              url: 'mapbox://tahmed.67lv0km2'
          },
          'source-layer': 'Output_Areas_Dec_2021_Boundar-dp2i2i',
          paint: {
              'fill-opacity': 0.5
          },
          layout: {
              visibility: areOutputAreasVisible ? 'visible' : 'none'
          },
          filter: ['in', 'OA21CD', ...intersectingOACodes]
      };

      // Remove existing layer and source if they exist
      if (map.getLayer('output-areas')) {
          map.removeLayer('output-areas');
      }
      if (map.getSource('output-areas')) {
          map.removeSource('output-areas');
      }

      // Find the first symbol layer in the map style
      let firstSymbolId;
      for (const layer of map.getStyle().layers) {
          if (layer.type === 'symbol') {
              firstSymbolId = layer.id;
              break;
          }
      }

      // Add new layer just before the first symbol layer
      map.addLayer(layerConfig, firstSymbolId);

      // Prepare color expressions for Mapbox GL JS
      const colorMatchExpression = ['match', ['get', 'OA21CD']];
      Object.entries(oaInfoMap).forEach(([code, info]) => {
          colorMatchExpression.push(code, colorScale(info.supergroupName));
      });
      colorMatchExpression.push('#ccc'); // Default color for non-matching areas

      console.log('Color Match Expression:', JSON.stringify(colorMatchExpression));

      // Update the fill-color property with the new expression
      map.setPaintProperty('output-areas', 'fill-color', colorMatchExpression);

      // Update the filter
      map.setFilter('output-areas', ['in', 'OA21CD', ...intersectingOACodes]);

      // Remove existing event listeners
      map.off('mousemove', 'output-areas');
      map.off('mouseleave', 'output-areas');

      updateSummaryStats(outputAreas)
      
      try {
        const treemapData = generateTreemapData(outputAreas);
        console.log('Treemap data:', treemapData);
        d3.select("#treemap-container").selectAll("*").remove(); // Clear previous treemap
        createTreemap(treemapData);
      } catch (error) {
        console.error('Error creating treemap:', error);
        // Optionally, display an error message to the user
      }

      // Add hover effect
      map.on('mousemove', 'output-areas', (e) => {
          const features = map.queryRenderedFeatures(e.point, { layers: ['output-areas'] });
          
          if (features.length > 0) {
              const feature = features[0];
              const oaCode = feature.properties.OA21CD;
              const oaInfo = oaInfoMap[oaCode];
              
              if (oaInfo) {
                  map.getCanvas().style.cursor = 'pointer';
                  
                  if (!currentPopup) {
                      currentPopup = new mapboxgl.Popup({
                          closeButton: false,
                          closeOnClick: false
                      });
                  }

                  currentPopup.setLngLat(e.lngLat)
                    .setHTML(`
                      <div class="popup-content">
                        <h3>Output Area: ${oaCode}</h3>
                        <p><span class="color-indicator" style="background-color: ${supergroupColors[oaInfo.supergroupName]}"></span> Supergroup: ${oaInfo.supergroupName}</p>
                        <p>Group: ${oaInfo.groupName}</p>
                        <p>Subgroup: ${oaInfo.subgroupName}</p>
                      </div>
                    `)
                    .addTo(map);
                  }
                  
          } else {
              map.getCanvas().style.cursor = '';
              if (currentPopup) {
                  currentPopup.remove();
                  currentPopup = null;
              }
          }
      });

      // Remove popup when mouse leaves the output areas layer
      map.on('mouseleave', 'output-areas', () => {
          map.getCanvas().style.cursor = '';
          if (currentPopup) {
              currentPopup.remove();
              currentPopup = null;
          }
      });

      // Log unique Supergroups and their colors for debugging
      uniqueSupergroups.forEach(supergroup => {
          console.log(`Supergroup: ${supergroup}, Color: ${colorScale(supergroup)}`);
      });

      // Add a legend to the map
      addLegend(uniqueSupergroups, colorScale);
  } catch (error) {
      console.error('Error updating output areas:', error);
      alert('Error updating output areas. Please try again.');
  }
}

// ... (rest of the code remains unchanged)

function addLegend(uniqueSupergroups, colorScale) {
  let legendContainer = document.getElementById('legend');
  
  if (!legendContainer) {
    legendContainer = document.createElement('div');
    legendContainer.id = 'legend';
    legendContainer.style.position = 'absolute';
    legendContainer.style.top = '10px';
    legendContainer.style.right = '10px';
    legendContainer.style.backgroundColor = 'rgba(47, 43, 56,0.9)';
    legendContainer.style.padding = '10px';
    legendContainer.style.borderRadius = '5px';
    legendContainer.style.maxHeight = '300px';
    legendContainer.style.overflowY = 'auto';
    document.body.appendChild(legendContainer);
  }

  legendContainer.innerHTML = '<h4>Supergroup Legend</h4>';

  uniqueSupergroups.forEach(supergroup => {
    const item = document.createElement('div');
    const key = document.createElement('span');
    key.className = 'legend-key';
    key.style.backgroundColor = supergroupColors[supergroup];
    key.style.display = 'inline-block';
    key.style.width = '20px';
    key.style.height = '20px';
    key.style.marginRight = '5px';

    const value = document.createElement('span');
    value.innerHTML = supergroup;

    item.appendChild(key);
    item.appendChild(value);
    legendContainer.appendChild(item);
  });
}

function generateTreemapData(outputAreas) {
  const intersectingOAs = outputAreas.features.map(feature => feature.properties.OA21CD);
  const filteredFeatures = censusFeatures.filter(feature => intersectingOAs.includes(feature.geography));

  const treemapData = {
      name: "All",
      children: []
  };

  const supergroupMap = new Map();

  filteredFeatures.forEach(feature => {
      const supergroup = feature['Supergroup Name'] || 'Unknown Supergroup';
      const group = feature['Group Name'] || 'Unknown Group';
      const subgroup = feature['Subgroup Name'] || 'Unknown Subgroup';
      const value = 1; // You can change this to a specific value if needed

      if (!supergroupMap.has(supergroup)) {
          supergroupMap.set(supergroup, new Map());
      }
      const groupMap = supergroupMap.get(supergroup);

      if (!groupMap.has(group)) {
          groupMap.set(group, new Map());
      }
      const subgroupMap = groupMap.get(group);

      if (!subgroupMap.has(subgroup)) {
          subgroupMap.set(subgroup, 0);
      }
      subgroupMap.set(subgroup, subgroupMap.get(subgroup) + value);
  });

  supergroupMap.forEach((groupMap, supergroup) => {
      const supergroupNode = { name: supergroup, children: [] };
      groupMap.forEach((subgroupMap, group) => {
          const groupNode = { name: group, children: [] };
          subgroupMap.forEach((value, subgroup) => {
              groupNode.children.push({ name: subgroup, value: value });
          });
          supergroupNode.children.push(groupNode);
      });
      treemapData.children.push(supergroupNode);
  });

  console.log('Generated treemap data:', treemapData);
  return treemapData;
}

function createTreemap(data) {
  console.log('Input data:', data);

  const container = d3.select("#treemap-container");
  container.selectAll("*").remove(); // Clear previous content

  const width = 300;
  const height = 550;

  function tile(node, x0, y0, x1, y1) {
    d3.treemapBinary(node, 0, 0, width, height);
    for (const child of node.children) {
      child.x0 = x0 + child.x0 / width * (x1 - x0);
      child.x1 = x0 + child.x1 / width * (x1 - x0);
      child.y0 = y0 + child.y0 / height * (y1 - y0);
      child.y1 = y0 + child.y1 / height * (y1 - y0);
    }
  }

  const hierarchy = d3.hierarchy(data)
    .sum(d => d.value)
    .sort((a, b) => b.value - a.value);
  const root = d3.treemap().tile(tile)(hierarchy);

  // Assign colors to all nodes based on their supergroup
  root.each(d => {
    if (d.depth === 0) {
      d.color = "#fff"; // root node
    } else if (d.depth === 1) {
      d.color = supergroupColors[d.data.name] || "#ccc";
    } else {
      d.color = d.parent.color;
    }
  });

  const x = d3.scaleLinear().rangeRound([0, width]);
  const y = d3.scaleLinear().rangeRound([0, height]);

  const format = d3.format(",d");
  const name = d => d.ancestors().reverse().map(d => d.data.name).join("/");

  const svg = container.append("svg")
    .attr("viewBox", [0.5, -30.5, width, height + 30])
    .attr("width", width)
    .attr("height", height + 30)
    .attr("style", "max-width: 100%; height: auto;")
    .style("font", "14px sans-serif"); // Increased base font size to 14px

  let group = svg.append("g")
    .call(render, root);

  function render(group, root) {
    const node = group
      .selectAll("g")
      .data(root.children.concat(root))
      .join("g");

    node.filter(d => d === root ? d.parent : d.children)
      .attr("cursor", "pointer")
      .on("click", (event, d) => d === root ? zoomout(root) : zoomin(d));

    node.append("title")
      .text(d => `${name(d)}\n${format(d.value)}`);

    node.append("rect")
      .attr("id", d => (d.leafUid = d3.select("leaf")).id)
      .attr("fill", d => d.color)
      .attr("stroke", "#fff");

    node.append("clipPath")
      .attr("id", d => (d.clipUid = d3.select("clip")).id)
      .append("use")
      .attr("xlink:href", d => d.leafUid.href);

    const text = node.append("text")
      .attr("clip-path", d => d.clipUid)
      .attr("font-weight", d => d === root ? "bold" : null)
      .style("font-size", "11px") // Fixed font size of 14px
      .attr("x", 3)
      .attr("y", 17); // Adjusted y position for larger font

    text.append("tspan")
      .text(d => d === root ? name(d) : d.data.name)
      .attr("fill", d => getContrastColor(d.color));

    text.append("tspan")
      .attr("fill-opacity", 0.7)
      .attr("x", 3)
      .attr("y", 27) // Adjusted y position for the second line
      .text(d => format(d.value))
      .attr("fill", d => getContrastColor(d.color));

    group.call(position, root);
  }

  function position(group, root) {
    group.selectAll("g")
      .attr("transform", d => {
        return d === root ? `translate(0,-30)` : `translate(${x(d.x0)},${y(d.y0)})`;
      })
      .select("rect")
      .attr("width", d => {
        return d === root ? width : Math.max(0, x(d.x1) - x(d.x0) - 1);
      })
      .attr("height", d => {
        return d === root ? 30 : Math.max(0, y(d.y1) - y(d.y0) - 1);
      });
  }

  function zoomin(d) {
    const group0 = group.attr("pointer-events", "none");
    const group1 = group = svg.append("g").call(render, d);

    x.domain([d.x0, d.x1]);
    y.domain([d.y0, d.y1]);

    svg.transition()
      .duration(750)
      .call(t => group0.transition(t).remove()
        .call(position, d.parent))
      .call(t => group1.transition(t)
        .attrTween("opacity", () => d3.interpolate(0, 1))
        .call(position, d));
  }

  function zoomout(d) {
    const group0 = group.attr("pointer-events", "none");
    const group1 = group = svg.insert("g", "*").call(render, d.parent);

    x.domain([d.parent.x0, d.parent.x1]);
    y.domain([d.parent.y0, d.parent.y1]);

    svg.transition()
      .duration(750)
      .call(t => group0.transition(t).remove()
        .attrTween("opacity", () => d3.interpolate(1, 0))
        .call(position, d))
      .call(t => group1.transition(t)
        .call(position, d.parent));
  }

  console.log('SVG element:', svg.node());
}

// Helper function to determine text color based on background color
function getContrastColor(hexcolor) {
  if (!hexcolor || hexcolor === "#fff") return 'black';
  
  // Convert hex to RGB
  let r = parseInt(hexcolor.substr(1,2),16);
  let g = parseInt(hexcolor.substr(3,2),16);
  let b = parseInt(hexcolor.substr(5,2),16);
  
  // Calculate luminance
  let yiq = ((r*299)+(g*587)+(b*114))/1000;
  
  // Return black or white depending on luminance
  return (yiq >= 128) ? 'black' : 'white';
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
      <p>Intersecting Output Areas: ${intersectingOAsCount}</p>
      <p>Total Population: ${totalPopulation}</p>
      <p>Average Age: ${weightedAverageAgeMean.toFixed(2)}</p>
      <p>Average Deprivation: ${weightedAverageDeprivationMean.toFixed(2)}</p>
      <p>Average Cars: ${weightedAverageCarsMean.toFixed(2)}</p>
      <h3>Ethnicity</h3>
      <ul>
        <li>White: ${sumByEthnicity['White']} (${percentageByEthnicity['White']}%)</li>
        <li>Asian: ${sumByEthnicity['Asian']} (${percentageByEthnicity['Asian']}%)</li>
        <li>Black: ${sumByEthnicity['Black']} (${percentageByEthnicity['Black']}%)</li>
      </ul>
      <h3>Housing Type</h3>
      <ul>
        <li>Detached: ${sumByHousingType['Detached']} (${percentageByHousingType['Detached']}%)</li>
        <li>Semi-detached: ${sumByHousingType['Semi-detached']} (${percentageByHousingType['Semi-detached']}%)</li>
        <li>Terraced: ${sumByHousingType['Terraced']} (${percentageByHousingType['Terraced']}%)</li>
      </ul>
      <h3>Tenure</h3>
      <ul>
        <li>Owned: ${sumByTenure['Owned']} (${percentageByTenure['Owned']}%)</li>
        <li>Social Rented: ${sumByTenure['Social Rented']} (${percentageByTenure['Social Rented']}%)</li>
        <li>Private Rented: ${sumByTenure['Private Rented']} (${percentageByTenure['Private Rented']}%)</li>
        <li>Lives Rent Free: ${sumByTenure['Lives Rent Free']} (${percentageByTenure['Lives Rent Free']}%)</li>
      </ul>
      <h3>Travel to Work</h3>
      <ul>
        <li>Driving: ${sumByTravelToWork['Driving a Car or Van']} (${percentageByTravelToWork['Driving a Car or Van']}%)</li>
        <li>Work from Home: ${sumByTravelToWork['Work Mainly at or from Home']} (${percentageByTravelToWork['Work Mainly at or from Home']}%)</li>
      </ul>
      <h3>Qualifications</h3>
      <ul>
        <li>No Qualifications: ${sumByQualification['No Qualifications']} (${percentageByQualification['No Qualifications']}%)</li>
        <li>Level 4 Qualifications and Above: ${sumByQualification['Level 4 Qualifications and Above']} (${percentageByQualification['Level 4 Qualifications and Above']}%)</li>
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
