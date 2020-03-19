// Three JS is assumed to be in the global scope in extensions
//  such as OrbitControls.js below
import * as THREE from "three";
global.THREE = THREE;

import RenderToBuffer from "./RenderToBuffer.js";

// strategy:
// 0. based on depth, aggregate atoms in the molecule into larger spheres using clustering ?
// 1. write spheres as GL_POINTs with appropriately scaled size
// 2. fragment shader: discard pts outside of sphere,
//    write normal
//    write depth
//    write color
//    write instance id (for same molecule...)
// 3. AO shader + blend over color buffer
// 4. outline shader over color buffer
//

// buffer of points to be drawn as sprites
class MoleculePass {
    constructor(n) {
        this.createMoleculeBuffer(n);

        const vertexShader = `
        precision highp float;

        attribute float vTypeId;
        attribute float vInstanceId;

            uniform float iTime;
            uniform vec2 iResolution;
            uniform float Scale;
            varying vec3 IN_viewPos;
            varying float IN_radius;
            flat out int IN_typeId;
            flat out int IN_instanceId;
            // varying vec4 IN_color;
            // flat int IN_atomId;
            uniform float radius;
            void main()	{
                vec3 p = position.xyz;
                vec4 modelViewPosition = modelViewMatrix * vec4(p, 1.0);
                IN_viewPos = modelViewPosition.xyz;
                //IN_viewZ = modelViewPosition.z;
                //IN_radius = 20.0;
                // IN_color = vec4(1.0, 0.0, 0.0, 1.0);
                // IN_instanceId = 1;
                // IN_atomId = 1;

                gl_Position = projectionMatrix * modelViewPosition;

                //IN_radius = (gl_Position.w > 0) ? gl_Position.w : 20.0;
                //gl_PointSize = IN_radius;
                //center = (0.5 * gl_Position.xy/gl_Position.w + 0.5) * vpSize;

                gl_PointSize = iResolution.y * projectionMatrix[1][1] * radius * Scale / gl_Position.w;
                //gl_PointSize = 10.0;
                //gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
                IN_radius = radius;
                IN_typeId = int(vTypeId);
                IN_instanceId = int(vInstanceId);
            }
        `;

        const fragmentShader = `
        precision highp float;

        varying vec3 IN_viewPos;
        varying float IN_radius;
        flat in int IN_typeId;
        flat in int IN_instanceId;
            // varying vec4 IN_color;
            // flat int IN_instanceId;
            // flat int IN_atomId;

            uniform float iTime;
            uniform vec2 iResolution;

            uniform float Scale;
            uniform mat4 modelViewMatrix;
            uniform mat4 projectionMatrix;
            
            void main()	{
                //gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
                //return;
                

                vec2 uv = (gl_PointCoord - vec2(.5, .5)) * 2.0;
                float lensqr = dot(uv, uv);
                if (lensqr > 1.0) discard;

                vec3 normal = vec3(uv.x, uv.y, sqrt(1.0 - lensqr));
                normal = normalize(normal);
                vec3 normalOut = normal * 0.5 + 0.5;
                //out_normal = vec4(normalOut, 1.0);
  
                vec3 fragViewPos = IN_viewPos;
                // adding pushes Z back. so "center" of sphere is "frontmost"
                fragViewPos.z += IN_radius * Scale * sqrt(1.0 - lensqr);
                //out_viewPos = vec4(fragViewPos.x, fragViewPos.y, fragViewPos.z, 1.0); // view space position buffer, for ssao
              
                vec4 fragPosClip = projectionMatrix * vec4(fragViewPos, 1.0);
                vec3 fragPosNDC = fragPosClip.xyz / fragPosClip.w;
                float n = gl_DepthRange.near;
                float f = gl_DepthRange.far;
                float fragPosDepth = (((f - n) * fragPosNDC.z) + n + f) / 2.0;
                gl_FragDepth = fragPosDepth;
              
                //out_color = IN_color;
                //out_instanceId = vec4(float(IN_instanceId), 0, 0, 1.0);
                //out_atomId = vec4(float(IN_atomId), 0, 0, 1.0);
  

                //gl_FragColor = vec4(fragPosDepth, 0.0, 0.0, 1.0);
                // gl_FragColor = vec4(gl_PointCoord.xy, 0.0, 1.0);
                
                gl_FragColor = vec4(float(IN_typeId), float(IN_instanceId), fragViewPos.z, 1.0);
                //gl_FragColor = vec4(float(IN_typeId)/50.0, float(IN_typeId)/50.0, float(IN_typeId)/50.0, 1.0);
                //gl_FragColor = vec4(84.0/255.0, 179.0/255.0, 162.0/255.0, 1.0);
            }

        `;

        const normalShader = `
        precision highp float;

        varying vec3 IN_viewPos;
        varying float IN_radius;
            // varying vec4 IN_color;
            // flat int IN_instanceId;
            // flat int IN_atomId;

            uniform float iTime;
            uniform vec2 iResolution;

            uniform float Scale;
            uniform mat4 modelViewMatrix;
            uniform mat4 projectionMatrix;
            
            void main()	{
                
                vec2 uv = (gl_PointCoord - vec2(.5, .5)) * 2.0;
                float lensqr = dot(uv, uv);
                if (lensqr > 1.0) discard;

                vec3 normal = vec3(uv.x, uv.y, sqrt(1.0 - lensqr));
                normal = normalize(normal);
                vec3 normalOut = normal * 0.5 + 0.5;
                //out_normal = vec4(normalOut, 1.0);
  
                vec3 fragViewPos = IN_viewPos;
                // adding pushes Z back. so "center" of sphere is "frontmost"
                fragViewPos.z += IN_radius * Scale * sqrt(1.0 - lensqr);
                //out_viewPos = vec4(fragViewPos.x, fragViewPos.y, fragViewPos.z, 1.0); // view space position buffer, for ssao
              
                vec4 fragPosClip = projectionMatrix * vec4(fragViewPos, 1.0);
                vec3 fragPosNDC = fragPosClip.xyz / fragPosClip.w;
                float n = gl_DepthRange.near;
                float f = gl_DepthRange.far;
                float fragPosDepth = (((f - n) * fragPosNDC.z) + n + f) / 2.0;
                gl_FragDepth = fragPosDepth;
              
                //out_color = IN_color;
                //out_instanceId = vec4(float(IN_instanceId), 0, 0, 1.0);
                //out_atomId = vec4(float(IN_atomId), 0, 0, 1.0);
  

                //gl_FragColor = vec4(fragPosDepth, 0.0, 0.0, 1.0);
                gl_FragColor = vec4(normalOut, 1.0);
            }

        `;
        const positionShader = `
        precision highp float;

        varying vec3 IN_viewPos;
        varying float IN_radius;
            // varying vec4 IN_color;
            // flat int IN_instanceId;
            // flat int IN_atomId;

            uniform float iTime;
            uniform vec2 iResolution;

            uniform float Scale;
            uniform mat4 modelViewMatrix;
            uniform mat4 projectionMatrix;
            
            void main()	{
                
                vec2 uv = (gl_PointCoord - vec2(.5, .5)) * 2.0;
                float lensqr = dot(uv, uv);
                if (lensqr > 1.0) discard;

                vec3 normal = vec3(uv.x, uv.y, sqrt(1.0 - lensqr));
                normal = normalize(normal);
                vec3 normalOut = normal * 0.5 + 0.5;
                //out_normal = vec4(normalOut, 1.0);
  
                vec3 fragViewPos = IN_viewPos;
                // adding pushes Z back. so "center" of sphere is "frontmost"
                fragViewPos.z += IN_radius * Scale * sqrt(1.0 - lensqr);
                //out_viewPos = vec4(fragViewPos.x, fragViewPos.y, fragViewPos.z, 1.0); // view space position buffer, for ssao
              
                vec4 fragPosClip = projectionMatrix * vec4(fragViewPos, 1.0);
                vec3 fragPosNDC = fragPosClip.xyz / fragPosClip.w;
                float n = gl_DepthRange.near;
                float f = gl_DepthRange.far;
                float fragPosDepth = (((f - n) * fragPosNDC.z) + n + f) / 2.0;
                gl_FragDepth = fragPosDepth;
              
                //out_color = IN_color;
                //out_instanceId = vec4(float(IN_instanceId), 0, 0, 1.0);
                //out_atomId = vec4(float(IN_atomId), 0, 0, 1.0);
  

                //gl_FragColor = vec4(fragPosDepth, 0.0, 0.0, 1.0);
                gl_FragColor = vec4(fragViewPos.x, fragViewPos.y, fragViewPos.z, 1.0);
            }

        `;

        this.colorMaterial = new THREE.ShaderMaterial({
            uniforms: {
                radius: { value: 1.0 },
                color: { value: new THREE.Color(0x44ff44) },
                iTime: { value: 1.0 },
                iResolution: { value: new THREE.Vector2() },
                iChannel0: { value: null },
                iChannelResolution0: { value: new THREE.Vector2(2, 2) },
                splat: {
                    value: new THREE.TextureLoader().load("assets/splat.png"),
                },
                Scale: { value: 1.0 },
                projectionMatrix: { value: new THREE.Matrix4() },
            },
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            side: THREE.FrontSide,
            transparent: false,
        });
        this.normalMaterial = new THREE.ShaderMaterial({
            uniforms: {
                radius: { value: 1.0 },
                color: { value: new THREE.Color(0x44ff44) },
                iTime: { value: 1.0 },
                iResolution: { value: new THREE.Vector2() },
                iChannel0: { value: null },
                iChannelResolution0: { value: new THREE.Vector2(2, 2) },
                splat: {
                    value: new THREE.TextureLoader().load("assets/splat.png"),
                },
                Scale: { value: 1.0 },
                projectionMatrix: { value: new THREE.Matrix4() },
            },
            vertexShader: vertexShader,
            fragmentShader: normalShader,
            side: THREE.FrontSide,
            transparent: false,
        });
        this.positionMaterial = new THREE.ShaderMaterial({
            uniforms: {
                radius: { value: 1.0 },
                color: { value: new THREE.Color(0x44ff44) },
                iTime: { value: 1.0 },
                iResolution: { value: new THREE.Vector2() },
                iChannel0: { value: null },
                iChannelResolution0: { value: new THREE.Vector2(2, 2) },
                splat: {
                    value: new THREE.TextureLoader().load("assets/splat.png"),
                },
                Scale: { value: 1.0 },
                projectionMatrix: { value: new THREE.Matrix4() },
            },
            vertexShader: vertexShader,
            fragmentShader: positionShader,
            side: THREE.FrontSide,
            transparent: false,
        });

        // could break up into a few particles buffers at the cost of separate draw calls...
        this.particles = new THREE.Points(this.geometry, this.colorMaterial);
        this.particles.visible = false;
        this.scene = new THREE.Scene();
        this.scene.add(this.particles);
    }

    createMoleculeBuffer(n) {
        this.geometry = new THREE.BufferGeometry();
        var vertices = new Float32Array(n * 4);
        var typeIds = new Float32Array(n);
        var instanceIds = new Float32Array(n);
        for (var i = 0; i < n; i++) {
            // position
            vertices[i * 4] = 0;
            vertices[i * 4 + 1] = 0;
            vertices[i * 4 + 2] = 0;
            vertices[i * 4 + 3] = 1;
            // particle type id
            typeIds[i] = -1;
            // particle instance id
            instanceIds[i] = -1;
        }
        this.geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(vertices, 4)
        );
        this.geometry.setAttribute(
            "vTypeId",
            new THREE.Float32BufferAttribute(typeIds, 1)
        );
        this.geometry.setAttribute(
            "vInstanceId",
            new THREE.Float32BufferAttribute(instanceIds, 1)
        );
        if (this.particles) {
            this.particles.geometry = this.geometry;
        }
    }

    update(positions, typeIds, instanceIds, numVertices) {
        // update positions, and reset geoemtry int the particles object.
        this.particles.geometry.attributes.position.array.set(positions);
        this.particles.geometry.attributes.position.needsUpdate = true;

        this.particles.geometry.attributes.vTypeId.array.set(typeIds);
        this.particles.geometry.attributes.vTypeId.needsUpdate = true;

        this.particles.geometry.attributes.vInstanceId.array.set(instanceIds);
        this.particles.geometry.attributes.vInstanceId.needsUpdate = true;

        this.particles.geometry.setDrawRange(0, numVertices);

        this.particles.visible = true;
    }

    setAtomRadius(r) {
        this.colorMaterial.uniforms.radius.value = r;
        this.normalMaterial.uniforms.radius.value = r;
        this.positionMaterial.uniforms.radius.value = r;
    }

    resize(width, height) {
        this.colorMaterial.uniforms.iResolution.value = new THREE.Vector2(
            width,
            height
        );
        this.normalMaterial.uniforms.iResolution.value = new THREE.Vector2(
            width,
            height
        );
        this.positionMaterial.uniforms.iResolution.value = new THREE.Vector2(
            width,
            height
        );
    }

    render(renderer, camera, colorBuffer, normalBuffer, positionBuffer) {
        const c = renderer.getClearColor().clone();
        const a = renderer.getClearAlpha();
        // alpha == -1 is a marker to discard pixels later
        renderer.setClearColor(new THREE.Color(0.0, 0.0, 0.0), -1.0);

        // TODO : MRT
        renderer.setRenderTarget(colorBuffer);
        this.particles.material = this.colorMaterial;
        this.particles.material.uniforms.projectionMatrix.value =
            camera.projectionMatrix;
        renderer.render(this.scene, camera);
        renderer.setRenderTarget(normalBuffer);
        this.particles.material = this.normalMaterial;
        this.particles.material.uniforms.projectionMatrix.value =
            camera.projectionMatrix;
        renderer.render(this.scene, camera);
        renderer.setRenderTarget(positionBuffer);
        this.particles.material = this.positionMaterial;
        this.particles.material.uniforms.projectionMatrix.value =
            camera.projectionMatrix;
        renderer.render(this.scene, camera);

        renderer.setClearColor(c, a);
    }
}

export default MoleculePass;
