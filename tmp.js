"use strict";

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

async function main() {
  // Get A WebGL context
  /** @type {HTMLCanvasElement} */
  const canvas = document.querySelector("#canvas");
  const gl = canvas.getContext("webgl2");
  if (!gl) {
    return;
  }

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
  uniform vec4 u_translation;

  out vec3 v_normal;
  out vec3 v_surfacetoView;
  out vec2 v_texcoord;
  out vec4 v_color;

  void main() {
    vec4 worldPosition = u_world * a_position + u_translation;
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

  const objFileName = 'assets/grass.obj';  // Name of the file to be load
  const mtlFileName = 'assets/grass.mtl';  // Name of the file to be load
  const texFileName = 'assets/fallTree.png';  // Name of the file to be load

  const treeFileName = 'assets/fatTree.obj';  // Name of the file to be load
  const treeMtlFileName = 'assets/fatTree.mtl';  // Name of the file to be load
  const treeTexFileName = 'assets/fallTree.png';  // Name of the file to be load

  const bigTreeFileName = 'assets/bigTree.obj';  // Name of the file to be load
  const bigTreeMtlFileName = 'assets/bigTree.mtl';  // Name of the file to be load
  const bigTreeTexFileName = 'assets/fallTree.png';  // Name of the file to be load

  async function loadFile(file) {
    const response = await fetch(file);
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    return response.text();
  }

  const [objText, mtlText, treeText, treeMtlText, bigTreeText, bigTreeMtlText] = await Promise.all([
    loadFile(objFileName),
    loadFile(mtlFileName),
    loadFile(treeFileName),
    loadFile(treeMtlFileName),
    loadFile(bigTreeFileName),
    loadFile(bigTreeMtlFileName),
  ]);

  const obj = parseOBJ(objText);
  const materials = parseMTL(mtlText);

  const treeObj = parseOBJ(treeText);
  const treeMaterials = parseMTL(treeMtlText);

  const bigTreeObj = parseOBJ(bigTreeText);
  const bigTreeMaterials = parseMTL(bigTreeMtlText);

  const textures = {
    defaultWhite: twgl.createTexture(gl, {src: [255, 255, 255, 255]}),
  };

  loadTexture(materials, texFileName, textures, gl);
  loadTexture(treeMaterials, treeTexFileName, textures, gl);
  loadTexture(bigTreeMaterials, bigTreeTexFileName, textures, gl);

  const defaultMaterial = {
    diffuse: [1, 1, 1],
    diffuseMap: textures.defaultWhite,
    ambient: [0, 0, 0],
    specular: [1, 1, 1],
    specularMap: textures.defaultWhite,
    shininess: 400,
    opacity: 1,
  };

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

  const cameraPosition = [20, 3.5, 10];
  const cameraTarget = [0, 0, 0];
  const zNear = 0.1;  // Set near clipping plane to a small positive value
  const zFar = 500;   // Far clipping plane

  const N = 10;  // Number of objects to draw
  const objectData = [];

  for (let i = 0; i < N; i++) {
    const x = (Math.random() - 0.5) * 50;
    const y = (Math.random() - 0.5) * 10;
    const z = (Math.random() - 0.5) * 50;
    const scale = Math.random() * 0.5 + 0.5;  // Scale between 0.5 and 1.0
    const type = Math.floor(Math.random() * 3);  // Randomly choose between 0, 1, and 2
    objectData.push({ position: [x, y, z, 1], scale: scale, type: type });
  }

  function degToRad(deg) {
    return deg * Math.PI / 180;
  }

  function render(time) {
    time *= 0.001;  // convert to seconds

    twgl.resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);

    const fieldOfViewRadians = degToRad(60);
    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    const projection = m4.perspective(fieldOfViewRadians, aspect, zNear, zFar);

    const up = [0, 1, 0];
    // Compute the camera's matrix using look at.
    const camera = m4.lookAt(cameraPosition, cameraTarget, up);

    // Make a view matrix from the camera matrix.
    const view = m4.inverse(camera);

    const sharedUniforms = {
      u_lightDirection: m4.normalize([-1, 3, 5]),
      u_view: view,
      u_projection: projection,
    };

    gl.useProgram(meshProgramInfo.program);

    // calls gl.uniform
    twgl.setUniforms(meshProgramInfo, sharedUniforms);

    for (const {position, scale, type} of objectData) {
      let parts;

      if (type === 0) {
        parts = grassParts;
      } else if (type === 1) {
        parts = treeParts;
      } else {
        parts = bigTreeParts;
      }

      for (const {bufferInfo, vao, material} of parts) {
        // set the attributes for this part.
        gl.bindVertexArray(vao);

        let u_world = m4.identity();
        u_world = m4.translate(u_world, ...position.slice(0, 3));
        u_world = m4.scale(u_world, scale, scale, scale);

        twgl.setUniforms(meshProgramInfo, {
          u_world,
          u_translation: position,
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
