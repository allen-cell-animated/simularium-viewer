import { Color, DataTexture, FloatType, RGBAFormat, Vector3 } from "three";

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
                instanceIdTex: { value: null },
                depthBufferTex: { value: null },
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
            uniform sampler2D instanceIdTex;
            uniform sampler2D depthBufferTex;

            uniform sampler2D colorsBuffer;
            
            uniform float zNear;
            uniform float zFar;
            uniform vec3 backgroundColor;
            uniform vec3 bgHCLoffset;

            uniform float highlightInstance;
            
            uniform float atomicBeginDistance; // = 100.0;
            uniform float chainBeginDistance; // = 150.0;

            // layout(std430) buffer;
            // layout(binding = 0) buffer INPUT0 {
            //   vec4 AtomInfos[];
            // };
            
            // layout(binding = 1) buffer INPUT1 {
            //   vec4 ProteinInstanceInfo[];
            // };
            
            // layout(binding = 2) buffer INPUT2 {
            //    vec4 IngredientInfo[];
            //  };
            
            //_ProteinAtomInfos
            
            //out vec4 out_color;
            
            vec3 IngredientColor[47] = vec3[](
                vec3(1.0, 0.1, 0.1),
                vec3(1.0, 0.4, 0.4),
                vec3(1.0, 0.0, 0.0),
                vec3(1.0, 0.2, 0.2),
                vec3(1.0, 0.1, 0.1),
                vec3(1.0, 0.1, 0.1),
                vec3(1.0, 0.2, 0.2),
                vec3(1.0, 0.3, 0.3),
                vec3(1.0, 0.4, 0.4),
                vec3(1.0, 0.2, 0.2),
                vec3(1.0, 0.1, 0.1),
                vec3(1.0, 0.1, 0.1),
                vec3(1.0, 0.3, 0.3),
                vec3(1.0, 0.4, 0.4),
                vec3(1.0, 0.2, 0.2),
                vec3(1.0, 0.1, 0.1),
                vec3(1.0, 0.2, 0.2),
                vec3(1.0, 0.2, 0.2),
                vec3(1.0, 0.0, 0.0),
                vec3(1.0, 0.9, 0.1),
                vec3(1.0, 0.9, 0.5),
                vec3(1.0, 0.9, 0.4),
                vec3(1.0, 0.9, 0.4),
                vec3(1.0, 0.9, 0.0),
                vec3(0.4, 1.0, 0.3),
                vec3(0.2, 1.0, 0.0),
                vec3(0.2, 1.0, 0.0),
                vec3(0.5, 1.0, 0.4),
                vec3(0.4, 1.0, 0.3),
                vec3(0.5, 1.0, 0.4),
                vec3(0.5, 1.0, 0.3),
                vec3(0.2, 1.0, 0.0),
                vec3(0.2, 1.0, 0.0),
                vec3(0.3, 1.0, 0.1),
                vec3(0.4, 1.0, 0.3),
                vec3(0.3, 1.0, 0.2),
                vec3(0.4, 1.0, 0.2),
                vec3(0.3, 1.0, 0.1),
                vec3(0.2, 1.0, 0.0),
                vec3(0.2, 1.0, 0.8),
                vec3(0.5, 0.7, 1.0),
                vec3(0.1, 0.5, 1.0),
                vec3(0.0, 0.4, 1.0),
                vec3(0.1, 0.5, 1.0),
                vec3(0.2, 0.5, 1.0),
                vec3(0.7, 0.2, 1.0),
                vec3(0.8, 0.4, 1.0)
            );
            
            vec3 IngredientColorHCL[48] = vec3[](
                //blood plasma
                vec3(35, 77, 70),
                vec3(38, 70, 70),
                vec3(30, 70, 75),
                vec3(33, 77, 70),
                vec3(35, 77, 70),
                vec3(35, 77, 70),
                vec3(35, 77, 70),
                vec3(35, 77, 70),
                vec3(25, 77, 70),
                vec3(15, 77, 60),
                vec3(35, 77, 50),
                vec3(35, 77, 70),
                vec3(35, 69, 40),
                vec3(35, 77, 70),
                vec3(35, 77, 70),
                vec3(35, 77, 10),
                vec3(35, 77, 70),
                vec3(35, 77, 70),
                vec3(35, 90, 50),
                vec3(35, 77, 70),
            
                //surface proteins
                vec3(54, 23, 75),
            
                //
                vec3(290, 66, 62),
                vec3(280, 60, 75),
                vec3(275, 54, 79),
                vec3(290, 70, 50),
                vec3(290, 64, 55),
                vec3(290, 61, 62),
                vec3(290, 69, 61),
                vec3(290, 71, 68),
                vec3(290, 72, 65),
                vec3(290, 60, 61),
                vec3(290, 66, 62),
                vec3(290, 66, 65),
                vec3(290, 66, 68),
                vec3(290, 66, 59),
                vec3(290, 66, 75),
                vec3(290, 66,80),
                vec3(290, 66, 62),
                vec3(290, 66, 62),
                //capsid
              //vec3(120, 110, 160),
                vec3(150, 50, 50),
                //
                vec3(126, 61, 82),
                vec3(126, 61, 82),
                vec3(126, 61, 82),
                vec3(126, 61, 82),
                vec3(126, 61, 82),
                vec3(25, 111, 82), // RNA
                vec3(126, 61, 82), // membrane inner
              vec3(126, 71, 72) // membrane outer
            );
            
            vec3 AtomColors[7] = vec3[](
                vec3(0.784, 0.784, 0.784),
                vec3(1.0  , 1.0  ,1.0),
                vec3(0.561, 0.561,1),
                vec3(0.941, 0    ,0),
                vec3(1    , 0.647,0),
                vec3(1    , 0.784,0.196),
                vec3(1    , 0,1)
            );
            
            vec3 ResidueColors[23] = vec3[](
                vec3(200,200,200)/255.0,     // ALA      dark grey
                vec3(20,90,255)/255.0,       // ARG      blue
                vec3(0,220,220)/255.0,       // ASN      cyan
                vec3(230,10,10)/255.0,       // ASP      bright red
                vec3(255,200,50)/255.0,      // CYS      yellow
                vec3(0,220,220)/255.0,       // GLN      cyan
                vec3(230,10,10)/255.0,       // GLU      bright red
                vec3(235,235,235)/255.0,     // GLY      light grey
                vec3(130,130,210)/255.0,     // HID      pale blue
                vec3(130,130,210)/255.0,     // HIE      pale blue
                vec3(130,130,210)/255.0,     // HIP      pale blue
                vec3(130,130,210)/255.0,     // HIS      pale blue
                vec3(15,130,15)/255.0,       // ILE      green
                vec3(15,130,15)/255.0,       // LEU      green
                vec3(20,90,255)/255.0,       // LYS      blue
                vec3(255,200,50)/255.0,      // MET      yellow
                vec3(50,50,170)/255.0,       // PHE      mid blue
                vec3(220,150,130)/255.0,     // PRO      flesh
                vec3(250,150,0)/255.0,       // SER      orange
                vec3(250,150,0)/255.0,       // THR      orange
                vec3(180,90,180)/255.0,      // TRP      pink
                vec3(50,50,170)/255.0,       // TYR      mid blue
                vec3(15,130,15) /255.0       // VAL      green
            );
                        
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
                //int instanceId = int(texture(instanceIdTex, texCoords).r);
                int instanceId = int(col0.y);
            
                if(instanceId < 0)
                    discard;
            
                vec4 instanceInfo = vec4(0.0,0.0,0.0,0.0);//ProteinInstanceInfo[instanceId];
                //int ingredientId = int(instanceInfo.x);
                int ingredientId = int(col0.x);

                //vec4 col = vec4(IngredientColor[ingredientId],1.0);
                // todo: consider using UINT for optimal % operator, instead of INT
                //vec4 col = vec4(ResidueColors[ingredientId % 23],1.0);
                ivec2 ncols = textureSize(colorsBuffer, 0);
                vec4 col = texelFetch(colorsBuffer, ivec2(ingredientId % ncols.x, 0), 0);

                //float z_b = texture(depthBufferTex, texCoords).r;
                //float eyeDepth = LinearEyeDepth(z_b);
                float eyeDepth = -col0.z;

                vec4 atomInfo = vec4(0.0,1.0,0.0,0.0);//AtomInfos[atomId];

                int secondaryStructure = int(atomInfo.x);
                int atomSymbolId = int(atomInfo.y);
                int residueSymbolId = int(atomInfo.z);
                int chainSymbolId = int(atomInfo.w);

                //int numChains = int(IngredientInfo[ingredientId].y);
                int numChains = 1;

                //predefined colors
                //atomSymbolId = 2;
                //vec3 atomColor = AtomColors[atomSymbolId];
                vec3 atomColor = col.xyz;
                //atomColor = vec3(1,1,1);
                vec3 aminoAcidColor = ResidueColors[residueSymbolId]; // currently not used

                //ToDo:
            
                //ingredient colors and color ranges
                //float ingredientLocalIndex = _ProteinIngredientsRandomValues[proteinInstanceInfo.proteinIngredientType].x;
                //float3 ingredientGroupsColorValues = _IngredientGroupsColorValues[groupId].xyz;
                //float3 ingredientGroupsColorRanges = _IngredientGroupsColorRanges[groupId].xyz;
                float ingredientLocalIndex;
                vec3 ingredientGroupsColorValues;
                vec3 ingredientGroupsColorRanges;
            
                // background color as HCL
                vec3 bghcl = rgb2hcl(backgroundColor);


                //inital Hue-Chroma-Luminance
                float h = ingredientGroupsColorValues.x + (ingredientGroupsColorRanges.x) * (ingredientLocalIndex - 0.5f);
                float c = ingredientGroupsColorValues.y + (ingredientGroupsColorRanges.y) * (ingredientLocalIndex - 0.5f);
                float l = ingredientGroupsColorValues.z + (ingredientGroupsColorRanges.z) * (ingredientLocalIndex - 0.5f);
            
//                vec3 hcl = rgb_to_hcv(col.xyz*20.0);

                // atom color in HCL
                vec3 hcl = rgb2hcl(col.xyz);
                 h = hcl.r;
                 c = hcl.g;
                 l = hcl.b;

                 // per-pixel BG is related to atom color
                 bghcl = mix(bghcl, hcl, bgHCLoffset);
                 h = bghcl.r;
                 c = bghcl.g;
                 l = bghcl.b;

//                h = IngredientColorHCL[ingredientId].x;
//                c = IngredientColorHCL[ingredientId].y;
//                l = IngredientColorHCL[ingredientId].z;
            
            // chainBeginDistance should be > atomicBeginDistance

                //if(false)
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
            
                //if(false)
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
            
                // if (somethingIsSelected == 1)
                // {
                //   if (instanceInfo.y == 1.0)
                //   {
                //     c += 30;
                //     l += 11;
                //   }
                //   else {
                //     c -= 30;
                //     l -= 11;
                //   }
                // }
                //~ just tone it down a bright
                // l -= 11;
//                c -= 15.0/100.0;
            
                vec3 color;
                color = hcl2rgb(vec3(h, c, l));

                color = max(color, vec3(0.0,0.0,0.0));
                color = min(color, vec3(1.0,1.0,1.0));
                
                //if(false)
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
            
                if (highlightInstance == col0.y) {
                    color.xyz = vec3(1.0, 0.0, 0.0);
                }
                gl_FragColor = vec4(occ1 * occ2 * color.xyz, 1.0);
                
                //                gl_FragColor = vec4(occ1 * occ2 * col0.xyz, 1.0);
//                gl_FragColor = vec4(occ1 * occ2 * col.xyz, 1.0);
                //gl_FragColor = vec4(col.xyz, 1.0);

//~ for debug: depth
//gl_FragColor = vec4((eyeDepth-zNear)/(zFar-zNear), (eyeDepth-zNear)/(zFar-zNear), (eyeDepth-zNear)/(zFar-zNear), 1.0);
              //out_color = vec4(occ1 * occ2 * col.xyz, 1.0);
                //out_color = vec4(vec3(residueSymbolId), 1.0);
                //out_color = vec4(vec3(instanceId), 1.0);
                //out_color = vec4(vec3(numChains*0.01f,0,0), 1.0);
            
                //out_color = vec4(aminoAcidColor, 1.0);
                //out_color = vec4(vec3(chainSymbolId*0.5), 1.0);
            }
            
            `,
        });
    }

    // colorsData is a Float32Array of rgba
    public updateColors(numColors, colorsData): void {
        this.pass.material.uniforms.colorsBuffer.value = new DataTexture(
            colorsData,
            numColors,
            1,
            RGBAFormat,
            FloatType
        );
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public resize(x, y): void {}

    public render(
        renderer,
        camera,
        target,
        ssaoBuffer1,
        ssaoBuffer2,
        colorBuffer
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
