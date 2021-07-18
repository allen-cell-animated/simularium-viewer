import { FrontSide, Matrix4, ShaderMaterial, Vector2 } from "three";

import { MRTShaders } from "./MultipassMaterials";

const vertexShader = `
precision highp float;

    uniform vec2 iResolution;
    uniform float scale;
    varying vec3 IN_viewPos;
    varying float IN_radius;

    uniform float radius;
    void main()	{
        vec3 p = position.xyz;
        vec4 modelViewPosition = modelViewMatrix * vec4(p, 1.0);
        IN_viewPos = modelViewPosition.xyz;

        gl_Position = projectionMatrix * modelViewPosition;

        gl_PointSize = iResolution.y * projectionMatrix[1][1] * radius * scale / gl_Position.w;
        IN_radius = radius;
    }
`;

const fragmentShader = `
precision highp float;

varying vec3 IN_viewPos;
varying float IN_radius;


layout(location = 0) out vec4 gAgentInfo;
layout(location = 1) out vec4 gNormal;
layout(location = 2) out vec4 gPos;

    uniform vec2 iResolution;
    uniform float typeId;
    uniform float instanceId;
    
    uniform float scale;
    uniform mat4 modelViewMatrix;
    uniform mat4 projectionMatrix;
    
    void main()	{
        vec2 uv = (gl_PointCoord - vec2(.5, .5)) * 2.0;
        float lensqr = dot(uv, uv);
        if (lensqr > 1.0) discard;

        vec3 normal = vec3(uv.x, uv.y, sqrt(1.0 - lensqr));
        normal = normalize(normal);
        vec3 normalOut = normal * 0.5 + 0.5;

        vec3 fragViewPos = IN_viewPos;
        // adding pushes Z back. so "center" of sphere is "frontmost"
        fragViewPos.z += IN_radius * scale * sqrt(1.0 - lensqr);
      
        vec4 fragPosClip = projectionMatrix * vec4(fragViewPos, 1.0);
        vec3 fragPosNDC = fragPosClip.xyz / fragPosClip.w;
        float n = gl_DepthRange.near;
        float f = gl_DepthRange.far;
        float fragPosDepth = (((f - n) * fragPosNDC.z) + n + f) / 2.0;

        gl_FragDepth = fragPosDepth;
      
        gAgentInfo = vec4(typeId, instanceId, fragViewPos.z, fragPosDepth);
        gNormal = vec4(normalOut, 1.0);
        gPos = vec4(fragViewPos.x, fragViewPos.y, fragViewPos.z, 1.0);
    }

`;

const multiMaterial = new RawShaderMaterial({
    uniforms: {
        radius: { value: 1.0 },
        iResolution: { value: new Vector2() },
        scale: { value: 1.0 },
        projectionMatrix: { value: new Matrix4() },
        typeId: { value: 0 },
        instanceId: { value: 0 },
    },
    vertexShader: vertexShader,
    fragmentShader: fragmentShader,
    side: FrontSide,
    transparent: false,
});

const shaderSet: MRTShaders = {
    mat: multiMaterial,
};

export default {
    shaderSet,
};
