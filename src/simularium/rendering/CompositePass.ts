import {
    Color,
    DataTexture,
    FloatType,
    PerspectiveCamera,
    RGBAFormat,
    Vector3,
    WebGLRenderer,
    WebGLRenderTarget,
} from "three";

import RenderToBuffer from "./RenderToBuffer";

class CompositePass {
    public pass: RenderToBuffer;

    public constructor() {
        this.pass = new RenderToBuffer({
            uniforms: {
                colorTex: { value: null },
                ssaoTex1: { value: null },
                ssaoTex2: { value: null },
                atomIdTex: { value: null },
                // colors indexed by particle type id
                colorsBuffer: { value: null },
                backgroundColor: { value: new Color(1, 1, 1) },
                bgHCLoffset: { value: new Vector3(1.0, 0.0, 0.2) },
                zNear: { value: 0.1 },
                zFar: { value: 1000 },
                atomicBeginDistance: { value: 150 },
                chainBeginDistance: { value: 300 },
                highlightInstance: { value: -1 },
            },
            fragmentShader: `
            in vec2 vUv;
            
            uniform sampler2D colorTex;
            uniform sampler2D ssaoTex1;
            uniform sampler2D ssaoTex2;
            uniform sampler2D atomIdTex;

            uniform sampler2D colorsBuffer;
            
            uniform float zNear;
            uniform float zFar;
            uniform vec3 backgroundColor;
            uniform vec3 bgHCLoffset;

            // a single instance to get a special highlight
            uniform float highlightInstance;
            
            uniform float atomicBeginDistance; // = 100.0;
            uniform float chainBeginDistance; // = 150.0;
                                                
            const float HCLgamma_ = 3.0;
            const float HCLy0_ = 100.0;
            const float HCLmaxL_ = 0.530454533953517;

            vec3 hcl2rgb(in vec3 HCL)
            {
              vec3 RGB = vec3(0.0, 0.0, 0.0);
              if (HCL.z != 0.0) {
                float H = HCL.x;
                float C = HCL.y;
                float L = HCL.z * HCLmaxL_;
                float Q = exp((1.0 - C / (2.0 * L)) * (HCLgamma_ / HCLy0_));
                float U = (2.0 * L - C) / (2.0 * Q - 1.0);
                float V = C / Q;
                float T = tan((H + min(fract(2.0 * H) / 4.0, fract(-2.0 * H) / 8.0)) * 6.283185307);
                H *= 6.0;
                if (H <= 1.0) {
                  RGB.r = 1.0;
                  RGB.g = T / (1.0 + T);
                }
                else if (H <= 2.0) {
                  RGB.r = (1.0 + T) / T;
                  RGB.g = 1.0;
                }
                else if (H <= 3.0) {
                  RGB.g = 1.0;
                  RGB.b = 1.0 + T;
                }
                else if (H <= 4.0) {
                  RGB.g = 1.0 / (1.0 + T);
                  RGB.b = 1.0;
                }
                else if (H <= 5.0) {
                  RGB.r = -1.0 / T;
                  RGB.b = 1.0;
                }
                else {
                  RGB.r = 1.0;
                  RGB.b = -T;
                }
                return RGB * V + U;
              }
              return RGB;
            }

            vec3 rgb2hcl(in vec3 RGB) {
              vec3 HCL = vec3(0.0, 0.0, 0.0);
              float H = 0.0;
              float U, V;
              U = -min(RGB.r, min(RGB.g, RGB.b));
              V = max(RGB.r, max(RGB.g, RGB.b));
              float Q = HCLgamma_ / HCLy0_;
              HCL.y = V + U;
              if (HCL.y != 0.0)
              {
                H = atan(RGB.g - RGB.b, RGB.r - RGB.g) / 3.14159265;
                Q *= -U / V;
              }
              Q = exp(Q);
              HCL.x = fract(H / 2.0 - min(fract(H), fract(-H)) / 6.0);
              HCL.y *= Q;
              HCL.z = mix(U, V, Q) / (HCLmaxL_ * 2.0);
              return HCL;
            }
                        
            float LinearEyeDepth(float z_b)
            {
                float z_n = 2.0 * z_b - 1.0;
                float z_e = 2.0 * zNear * zFar / (zFar + zNear - z_n * (zFar - zNear));
                return z_e;
            }
            
            void main(void)
            {
                vec2 texCoords = vUv;
                // contains IDs.  index into data buffer.
                // typeId, instanceId, viewZ
                vec4 col0 = texture(colorTex, texCoords);
                if (col0.w < 0.0) {
                    discard;
                }
                float occ1 = texture(ssaoTex1, texCoords).r;
                float occ2 = texture(ssaoTex2, texCoords).r;
                int atomId = int(texture(atomIdTex, texCoords).r);
                int instanceId = int(col0.y);
            
                if(instanceId < 0)
                    discard;
            
                vec4 instanceInfo = vec4(0.0,0.0,0.0,0.0);//ProteinInstanceInfo[instanceId];
                int ingredientId = abs(int(col0.x));
                float selected = (sign(col0.x) + 1.0) * 0.5;

                ivec2 ncols = textureSize(colorsBuffer, 0);
                vec4 col = texelFetch(colorsBuffer, ivec2(ingredientId % ncols.x, 0), 0);

                float eyeDepth = -col0.z;

                // TODO know some structural info about pdb
                vec4 atomInfo = vec4(0.0,1.0,0.0,0.0);//AtomInfos[atomId];
                int secondaryStructure = int(atomInfo.x);
                int atomSymbolId = int(atomInfo.y);
                int residueSymbolId = int(atomInfo.z);
                int chainSymbolId = int(atomInfo.w);

                //int numChains = int(IngredientInfo[ingredientId].y);
                int numChains = 1;

                vec3 atomColor = col.xyz;
            
                // background color as HCL
                vec3 bghcl = rgb2hcl(backgroundColor);

                //inital Hue-Chroma-Luminance

                // atom color in HCL
                vec3 hcl = rgb2hcl(col.xyz);
                float h = hcl.r;
                float c = hcl.g;
                float l = hcl.b;

                // per-pixel BG is related to atom color
                bghcl = mix(bghcl, hcl, bgHCLoffset);
                h = bghcl.r;
                c = bghcl.g;
                l = bghcl.b;

                // chainBeginDistance should be > atomicBeginDistance

                if(eyeDepth < chainBeginDistance)
                {
                    float cc = max(eyeDepth - atomicBeginDistance, 0.0);
                    float dd = chainBeginDistance - atomicBeginDistance;
                    float ddd = min(1.0, max(cc/dd, 0.0));
                    ddd = (1.0-(ddd));
                    if(atomSymbolId > 0) {
                        l = mix(bghcl.z, hcl.z, ddd);
                        c = mix(bghcl.y, hcl.y, ddd);
                        h = mix(bghcl.x, hcl.x, ddd);
                    }
                }
            
                // different colors for chains
                if(eyeDepth < chainBeginDistance && numChains > 1)
                {
                    float cc = max(eyeDepth - atomicBeginDistance, 0.0);
                    float dd = chainBeginDistance - atomicBeginDistance;
                    float ddd = min(1.0, max(cc/dd, 0.0));
                    ddd = (1.0-(ddd));
            
                    float wedge = min(50.0 * float(numChains), 180.0);
                    // float hueShift = wedge / numChains;
                    // hueShift *= ddd;
                    float hueShift = 50.0/360.0;
                    hueShift = numChains >= 3 ? 50.0/360.0 : hueShift;
                    hueShift = numChains >= 4 ? 50.0/360.0 : hueShift;
                    hueShift = numChains >= 5 ? 50.0/360.0 : hueShift;
                    hueShift = numChains >= 6 ? 50.0/360.0 : hueShift;
                    hueShift = numChains >= 7 ? 40.0/360.0 : hueShift;
                    hueShift = numChains >= 8 ? 30.0/360.0 : hueShift;
                    hueShift = numChains >= 9 ? 30.0/360.0 : hueShift;
                    hueShift = numChains >= 10 ? 15.0/360.0 : hueShift;
                    hueShift = numChains >= 11 ? 10.0/360.0 : hueShift;
                    hueShift = numChains >= 12 ? 10.0/360.0 : hueShift;
                    hueShift *= ddd;
            
                    float hueLength = hueShift * float(numChains - 1);
                    float hueOffset = hueLength * 0.5;
            
                    h -=  hueOffset;
                    h += (float(chainSymbolId) * hueShift);
                }
            
                vec3 color;
                color = hcl2rgb(vec3(h, c, l));

                color = max(color, vec3(0.0,0.0,0.0));
                color = min(color, vec3(1.0,1.0,1.0));
                
                if(eyeDepth < atomicBeginDistance)
                {
                    float t = (eyeDepth/atomicBeginDistance);
                    t = 1.0 - clamp(t, 0.0, 1.0);
                    // inside of atomicBeginDistance:
                    // near is atomColor, far is color.xyz
                    // linear RGB interp? not HCL?
                    color.xyz = mix(color.xyz, atomColor, t);
                    //color.xyz = atomColor;
                    //color.xyz = vec3(0.0, 1.0, 0.0);
                }
            
                gl_FragColor = vec4(occ1 * occ2 * color.xyz, 1.0);
            }
            `,
        });
    }

    // colorsData is a Float32Array of rgba
    public updateColors(numColors: number, colorsData: Float32Array): void {
        this.pass.material.uniforms.colorsBuffer.value = new DataTexture(
            colorsData,
            numColors,
            1,
            RGBAFormat,
            FloatType
        );
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public resize(x: number, y: number): void {
        /* do nothing */
    }

    public render(
        renderer: WebGLRenderer,
        camera: PerspectiveCamera,
        target: WebGLRenderTarget,
        ssaoBuffer1: WebGLRenderTarget,
        ssaoBuffer2: WebGLRenderTarget,
        colorBuffer: WebGLRenderTarget
    ): void {
        this.pass.material.uniforms.zNear.value = camera.near;
        this.pass.material.uniforms.zFar.value = camera.far;

        this.pass.material.uniforms.colorTex.value = colorBuffer.texture;
        this.pass.material.uniforms.ssaoTex1.value = ssaoBuffer1.texture;
        this.pass.material.uniforms.ssaoTex2.value = ssaoBuffer2.texture;

        // const c = renderer.getClearColor().clone();
        // const a = renderer.getClearAlpha();
        // renderer.setClearColor(
        //     new THREE.Color(0.121569, 0.13333, 0.17647),
        //     1.0
        // );

        this.pass.render(renderer, target);

        // renderer.setClearColor(c, a);
    }
}

export default CompositePass;
