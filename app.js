"use strict";

let SEED = 0;
let FOREST_SIZE = 135;
let FOREST_DENSITY = 100;
let TREE_SCALE = 1;
let GRASS_AMOUNT = 1;
let TREE_AMOUNT = 5;
let OBJECT_DATA = generateWorld(SEED, FOREST_DENSITY, FOREST_SIZE, TREE_SCALE, GRASS_AMOUNT, TREE_AMOUNT);
let GROUND_SIZE = 1700; 

const SPEED = 50;

function loadTexture(objectMaterial, source, textures, gl) {
  for (const material of Object.values(objectMaterial)) {
    Object.entries(material)
      .filter(([key]) => key.endsWith('Map'))
      .forEach(([key, filename]) => {
        let texture = textures[filename];
        if (!texture) {
          texture = twgl.createTexture(gl, {src: source, flipY: true});
          textures[filename] = texture;
        }
        material[key] = texture;
      });
  }
}

function createSeededRandomGenerator(seed) {
  const a = 1664525;
  const c = 1013904223;
  const m = 4294967296; // 2^32

  function nextSeed(seed) {
    return (a * seed + c) % m;
  }

  function random() {
    seed = nextSeed(seed);
    return seed / m;
  }

  return random;
}

function isTreePositionValid(newX, newZ, objectData, TREE_AMOUNT) {
  const minDistance = 12.5 - TREE_AMOUNT;  // Minimum distance between trees

  for (const obj of objectData) {
      if (obj.type === 1 || obj.type === 2 || obj.type === 4) {  // Check for trees
          const existingX = obj.position[0];
          const existingZ = obj.position[2];

          const distanceSq = (newX - existingX) ** 2 + (newZ - existingZ) ** 2;
          if (distanceSq < minDistance ** 2) {
              return false;  // Position overlaps with an existing tree
          }
      }
  }
  return true;  // Position is valid
}



function generateWorld(seed, FOREST_DENSITY, FOREST_SIZE, TREE_SCALE, GRASS_AMOUNT, TREE_AMOUNT) {
  
  // Type 0: Grass
  // Type 1: Tree
  // Type 2: Big Tree
  // Type 3: Rock
  // Type 4: Fat Tree

  FOREST_DENSITY = FOREST_DENSITY * FOREST_SIZE / 35;
  GRASS_AMOUNT = GRASS_AMOUNT * FOREST_SIZE / 35;

  const random = createSeededRandomGenerator(seed);
  const objectData = [];
  const maxAttempts = 100;  // Maximum attempts to find a suitable position

  for (let i = 0; i < FOREST_DENSITY; i++) {
    let type;
    let x, z, scale, rotation;
    let attempts = 0;

    do {
        // Randomly choose between 0, 1, 2, 3, and 4 but with better odds to 0 and 3
        type = random() < 0.66 ? 0 : Math.floor(random() * 4) + 1;
        x = (random() - 0.5) * FOREST_SIZE;
        z = (random() - 0.5) * FOREST_SIZE;

        if (type === 3) {
            scale = random() * 0.6 + 0.1;
            rotation = random() * 2 * Math.PI;
        } else if (type === 0) {
            scale = random() * 0.5 + 1;
            rotation = random() * 2 * Math.PI;
        } else {
            scale = random() * 0.8 + TREE_SCALE;
            rotation = random() * 2 * Math.PI;
        }

        // Check if the type is a tree (1, 2, or 4) and if it overlaps with existing trees
        if ((type !== 0 && type !== 3) && !isTreePositionValid(x, z, objectData, TREE_AMOUNT)) {
            type = undefined;  // Reset type to undefined if position is invalid
        }

        attempts++;
    } while (type === undefined && attempts < maxAttempts);

    if (type !== undefined) {
        objectData.push({ position: [x, 0, z, 1], scale, rotation, type });
    } else {
        console.warn(`Failed to place object ${i + 1} after ${maxAttempts} attempts.`);
    }
  }

  // Generate additional grass based on GRASS_AMOUNT
  for (let i = 0; i < GRASS_AMOUNT * 100; i++) {
    let x = (random() - 0.5) * FOREST_SIZE;
    let z = (random() - 0.5) * FOREST_SIZE;
    let scale = random() * 0.5 + 1;  // Grass scale
    let rotation = random() * 2 * Math.PI;

    objectData.push({ position: [x, 0, z, 1], scale, rotation, type: 0 });
  }

  return objectData;
}

function fitToContainer(canvas){
  // Make it visually fill the positioned parent
  canvas.style.width ='100%';
  canvas.style.height='100%';
  // ...then set the internal size to match
  canvas.width  = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
}


async function main() {
  // Get A WebGL context
  /** @type {HTMLCanvasElement} */
  const canvas = document.querySelector("#canvas");
  const gl = canvas.getContext("webgl2");
  if (!gl) {
    return;
  }

  fitToContainer(canvas);

  // Tell the twgl to match position with a_position etc..
  twgl.setAttributePrefix("a_");

  const vs = `#version 300 es
  in vec4 a_position;
  in vec3 a_normal;
  in vec2 a_texcoord;
  in vec4 a_color;

  uniform mat4 u_projection;
  uniform mat4 u_view;
  uniform mat4 u_world;
  uniform vec3 u_viewWorldPosition;

  out vec3 v_normal;
  out vec3 v_surfacetoView;
  out vec2 v_texcoord;
  out vec4 v_color;

  void main() {
    vec4 worldPosition = u_world * a_position;
    gl_Position = u_projection * u_view * worldPosition;
    v_surfacetoView = u_viewWorldPosition - worldPosition.xyz;
    v_normal = mat3(u_world) * a_normal;
    v_texcoord = a_texcoord;
    v_color = a_color;
  }
  `;

  const fs = `#version 300 es
  precision highp float;

  in vec3 v_normal;
  in vec3 v_surfacetoView;
  in vec2 v_texcoord;
  in vec4 v_color;

  uniform vec3 diffuse;
  uniform sampler2D diffuseMap;
  uniform vec3 ambient;
  uniform vec3 emissive;
  uniform vec3 specular;
  uniform sampler2D specularMap;
  uniform float shininess;
  uniform float opacity;
  uniform vec3 u_lightDirection;
  uniform vec3 u_ambientLight;

  out vec4 outColor;

  void main () {
    vec3 normal = normalize(v_normal);

    vec3 surfaceToViewDirection = normalize(v_surfacetoView);
    vec3 halfVector = normalize(u_lightDirection + surfaceToViewDirection);

    float fakeLight = dot(u_lightDirection, normal) * .5 + .5;
    float specularLight = clamp(dot(normal, halfVector), 0.0, 1.0);
    vec4 specularMapColor = texture(specularMap, v_texcoord);
    vec3 effectiveSpecular = specular * specularMapColor.rgb;

    vec4 diffuseMapColor = texture(diffuseMap, v_texcoord);
    vec3 effectiveDiffuse = diffuse * diffuseMapColor.rgb * v_color.rgb;
    float effectiveOpacity = opacity * diffuseMapColor.a * v_color.a;
    
    outColor = vec4(
      emissive +
      ambient * u_ambientLight +
      effectiveDiffuse * fakeLight +
      effectiveSpecular * pow(specularLight, shininess),
      effectiveOpacity);
  }
  `;

  // compiles and links the shaders, looks up attribute and uniform locations
  const meshProgramInfo = twgl.createProgramInfo(gl, [vs, fs]);

  const objFileName = 'assets/grass.obj';  
  const mtlFileName = 'assets/grass.mtl';  
  const texFileName = 'assets/treeTex.png';  

  const treeFileName = 'assets/Tree.obj';  
  const treeMtlFileName = 'assets/Tree.mtl';  
  const treeTexFileName = 'assets/treeTex.png';  

  const bigTreeFileName = 'assets/bigTree.obj';  
  const bigTreeMtlFileName = 'assets/bigTree.mtl';  
  const bigTreeTexFileName = 'assets/treeTex.png';  

  const rockFileName = 'assets/rock.obj';  
  const rockMtlFileName = 'assets/rock.mtl';  
  const rockTexFileName = 'assets/rock.png';  

  const fallTreeFileName = 'assets/fatTree.obj';  
  const fallTreeMtlFileName = 'assets/fatTree.mtl';  
  const fallTreeTexFileName = 'assets/treeTex.png';  

  async function loadFile(file) {
    const response = await fetch(file);
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    return response.text();
  }

  const [objText, mtlText, treeText, treeMtlText, bigTreeText, bigTreeMtlText, rockText, rockMtlText, fallTreeText, fallTreeMtlText] = await Promise.all([
    loadFile(objFileName),
    loadFile(mtlFileName),
    loadFile(treeFileName),
    loadFile(treeMtlFileName),
    loadFile(bigTreeFileName),
    loadFile(bigTreeMtlFileName),
    loadFile(rockFileName),
    loadFile(rockMtlFileName),
    loadFile(fallTreeFileName),
    loadFile(fallTreeMtlFileName),
  ]);

  const obj = parseOBJ(objText);
  const materials = parseMTL(mtlText);

  const treeObj = parseOBJ(treeText);
  const treeMaterials = parseMTL(treeMtlText);

  const bigTreeObj = parseOBJ(bigTreeText);
  const bigTreeMaterials = parseMTL(bigTreeMtlText);

  const rockObj = parseOBJ(rockText);
  const rockMaterials = parseMTL(rockMtlText);

  const fallTreeObj = parseOBJ(fallTreeText);
  const fallTreeMaterials = parseMTL(fallTreeMtlText);

  const textures = {
    defaultWhite: twgl.createTexture(gl, {src: [255, 255, 255, 255]}),
    defaultGreen: twgl.createTexture(gl, {src: [3, 46, 15, 255]})
  };

  loadTexture(materials, texFileName, textures, gl);
  loadTexture(treeMaterials, treeTexFileName, textures, gl);
  loadTexture(bigTreeMaterials, bigTreeTexFileName, textures, gl);
  loadTexture(rockMaterials, rockTexFileName, textures, gl);
  loadTexture(fallTreeMaterials, fallTreeTexFileName, textures, gl);

  const defaultMaterial = {
    diffuse: [1, 1, 1],
    diffuseMap: textures.defaultGreen,
    ambient: [0, 0, 0],
    specular: [1, 1, 1],
    specularMap: textures.defaultGreen,
    shininess: 400,
    opacity: 1,
  };

  const groundMaterial = {
    diffuse: [1, 1, 1],
    diffuseMap: twgl.createTexture(gl, { src: 'assets/grass.jpg' }),
    ambient: [1, 1, 1],
    specular: [1, 1, 1],
    shininess: 1,
    opacity: 1,
  };

  function loadGround(gl, program) {
    const floorArrays = {
      position: [
        -GROUND_SIZE, 0, -GROUND_SIZE,
        GROUND_SIZE, 0, -GROUND_SIZE,
        GROUND_SIZE, 0, GROUND_SIZE,
        -GROUND_SIZE, 0, -GROUND_SIZE,
        GROUND_SIZE, 0, GROUND_SIZE,
        -GROUND_SIZE, 0, 170,
      ],
      texcoord: [
        0, 0,
        170, 0,
        170, 170,
        0, 0,
        170, 170,
        0, 170,
      ],
      normal: [
        0, 1, 0,
        0, 1, 0,
        0, 1, 0,
        0, 1, 0,
        0, 1, 0,
        0, 1, 0,
      ]
    };
    const buffer = twgl.createBufferInfoFromArrays(gl, floorArrays);
    const vao = twgl.createVAOFromBufferInfo(gl, program, buffer);
  
    return {
      bufferInfo: buffer,
      vao
    };
  }

  const groundObj = loadGround(gl, meshProgramInfo);

  function createParts(gl, programInfo, obj, materials) {
    return obj.geometries.map(({material, data}) => {
      if (data.color) {
        if (data.position.length === data.color.length) {
          data.color = {numComponents: 3, data: data.color};
        }
      } else {
        data.color = {value: [1, 1, 1, 1]};
      }
  
      const bufferInfo = twgl.createBufferInfoFromArrays(gl, data);
      const vao = twgl.createVAOFromBufferInfo(gl, programInfo, bufferInfo);
  
      return {
        material: {...defaultMaterial, ...materials[material]},
        bufferInfo,
        vao,
      };
    });
  }

  const grassParts = createParts(gl, meshProgramInfo, obj, materials);
  const treeParts = createParts(gl, meshProgramInfo, treeObj, treeMaterials);
  const bigTreeParts = createParts(gl, meshProgramInfo, bigTreeObj, bigTreeMaterials);
  const rockParts = createParts(gl, meshProgramInfo, rockObj, rockMaterials);
  const fallTreeParts = createParts(gl, meshProgramInfo, fallTreeObj, fallTreeMaterials);


  let cameraPosition = [2, 47, 153];
  let cameraDirection = [0, -0.3, -1];

  canvas.addEventListener('mousemove', (event) => {
    cameraDirection = updateCameraDirection(event, cameraDirection);
  });

  document.getElementById('seedButton').addEventListener('click', function() {
    const seed = document.getElementById('inputBox').value;

    FOREST_SIZE = updateForestSizeValue();
    FOREST_DENSITY = updateForestDensityValue();
    TREE_SCALE = updateTreeScaleValue();
    GRASS_AMOUNT = updateGrassAmountValue();
    TREE_AMOUNT = updateTreeAmountValue();  
    OBJECT_DATA = generateWorld(seed, FOREST_DENSITY, FOREST_SIZE, TREE_SCALE, GRASS_AMOUNT, TREE_AMOUNT);
  });


  function degToRad(deg) {
    return deg * Math.PI / 180;
  }


  let then = 0;
  function render(time) {
    time *= 0.001;  // convert to seconds
  
    twgl.resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);


    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.clearColor(174/255, 198/255, 207/255, 1);
    
    
    const deltaTime = time - then;
    then = time;

    cameraPosition = updateCameraPosition(deltaTime, cameraDirection, cameraPosition);
  
    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    const projection = m4.perspective(fieldOfViewRadians, aspect, zNear, zFar);

    // Compute the camera's matrix using look at.
    const camera = m4.lookAt(cameraPosition, m4.addVectors(cameraPosition, cameraDirection), up);
  
    // Make a view matrix from the camera matrix.
    const view = m4.inverse(camera);
  
    const sharedUniforms = {
      u_lightDirection: m4.normalize([1, 0, 5]),
      u_view: view,
      u_projection: projection,
    };
  
    gl.useProgram(meshProgramInfo.program);
  
    // calls gl.uniform
    twgl.setUniforms(meshProgramInfo, sharedUniforms);
  
    // Set the transformation matrix for the ground
    let groundWorldMatrix = m4.identity();
    groundWorldMatrix = m4.xRotate(groundWorldMatrix, degToRad(180));
  
    gl.bindVertexArray(groundObj.vao);
  
    twgl.setUniforms(meshProgramInfo, {
      u_world: groundWorldMatrix,
    }, groundMaterial);
  
    twgl.drawBufferInfo(gl, groundObj.bufferInfo);
  
    for (const { position, scale, rotation, type } of OBJECT_DATA) {
      let parts;
  
      if (type === 0) {
        parts = grassParts;
      } else if (type === 1) {
        parts = treeParts;
      } else if (type === 2) {
        parts = bigTreeParts;
      } else if (type === 3) {
        parts = rockParts;
      } else {
        parts = fallTreeParts;
      }
  
      for (const { bufferInfo, vao, material } of parts) {
        // set the attributes for this part.
        gl.bindVertexArray(vao);
  
        let u_world = m4.identity();
        u_world = m4.translate(u_world, ...position.slice(0, 3));
        u_world = m4.scale(u_world, scale, scale, scale);
        u_world = m4.yRotate(u_world, rotation);
  
        twgl.setUniforms(meshProgramInfo, {
          u_world,
        }, material);
  
        // calls gl.drawArrays or gl.drawElements
        twgl.drawBufferInfo(gl, bufferInfo);
      }
    }
    requestAnimationFrame(render);
  }
  
  requestAnimationFrame(render);
}  

main();
