import RenderToBuffer from "./RenderToBuffer.js";

class CompositePass {
    constructor() {
        this.pass = new RenderToBuffer({
            uniforms: {
                colorTex: { value: null },
                ssaoTex1: { value: null },
                ssaoTex2: { value: null },
                atomIdTex: { value: null },
                instanceIdTex: { value: null },
                depthBufferTex: { value: null },
                zNear: {value: 0.1},
                zFar: {value: 1000},
            },
            fragmentShader: `
            in vec2 vUv;
            
            uniform sampler2D colorTex;
            uniform sampler2D ssaoTex1;
            uniform sampler2D ssaoTex2;
            uniform sampler2D atomIdTex;
            uniform sampler2D instanceIdTex;
            uniform sampler2D depthBufferTex;
            
            uniform float zNear;
            uniform float zFar;
            //uniform int somethingIsSelected;
            
            layout(std430) buffer;
            layout(binding = 0) buffer INPUT0 {
              vec4 AtomInfos[];
            };
            
            layout(binding = 1) buffer INPUT1 {
              vec4 ProteinInstanceInfo[];
            };
            
            layout(binding = 2) buffer INPUT2 {
               vec4 IngredientInfo[];
             };
            
            //_ProteinAtomInfos
            
            out vec4 out_color;
            
            float d3_lab_xyz(float x)
            {
                return x > 0.206893034 ? x * x * x : (x - 4.0 / 29.0) / 7.787037;
            }
            
            float d3_xyz_rgb(float r)
            {
                return round(255 * (r <= 0.00304 ? 12.92 * r : 1.055 * pow(r, 1.0 / 2.4) - 0.055));
            }
            
            vec3 d3_lab_rgb(float l, float a, float b)
            {
                float y = (l + 16.0) / 116.0;
                float x = y + a / 500.0;
                float z = y - b / 200.0;
            
                x = d3_lab_xyz(x) * 0.950470;
                y = d3_lab_xyz(y) * 1.0;
                z = d3_lab_xyz(z) * 1.088830;
            
                return vec3(
                    d3_xyz_rgb(3.2404542 * x - 1.5371385 * y - 0.4985314 * z),
                    d3_xyz_rgb(-0.9692660 * x + 1.8760108 * y + 0.0415560 * z),
                    d3_xyz_rgb(0.0556434 * x - 0.2040259 * y + 1.0572252 * z)
                );
            }
            
            vec3 d3_hcl_lab(float h, float c, float l)
            {
                float d3_radians = 0.01745329252;
                return d3_lab_rgb(l, cos(h * d3_radians) * c, sin(h * d3_radians) * c) / 255;
            }
            
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
            
            const float HCV_EPSILON = 1e-10;
            
            vec3 rgb_to_hcv(vec3 rgb)
            {
                // Based on work by Sam Hocevar and Emil Persson
                vec4 P = (rgb.g < rgb.b) ? vec4(rgb.bg, -1.0, 2.0/3.0) : vec4(rgb.gb, 0.0, -1.0/3.0);
                vec4 Q = (rgb.r < P.x) ? vec4(P.xyw, rgb.r) : vec4(rgb.r, P.yzx);
                float C = Q.x - min(Q.w, Q.y);
                float H = abs((Q.w - Q.y) / (6 * C + HCV_EPSILON) + Q.z);
                return vec3(H, C, Q.x);
            }
            
            const float atomicBeginDistance = 0.05;
            const float chainBeginDistance = 0.30;
            
            float LinearEyeDepth(float z_b)
            {
                float z_n = 2.0 * z_b - 1.0;
                float z_e = 2.0 * zNear * zFar / (zFar + zNear - z_n * (zFar - zNear));
                return z_e;
            }
            
            void main(void)
            {
                vec2 texCoords = vUv;
                vec4 col = texture(colorTex, texCoords);
                float occ1 = texture(ssaoTex1, texCoords).r;
                float occ2 = texture(ssaoTex2, texCoords).r;
                int atomId = int(texture(atomIdTex, texCoords).r);
                int instanceId = int(texture(instanceIdTex, texCoords).r);
            
                if(instanceId < 0)
                    discard;
            
                vec4 instanceInfo = ProteinInstanceInfo[instanceId];
                int ingredientId = int(instanceInfo.x);
            
                col = vec4(IngredientColor[ingredientId],1.0);
            
                float z_b = texture(depthBufferTex, texCoords).r;
                float eyeDepth = LinearEyeDepth(z_b);
            
                vec4 atomInfo = AtomInfos[atomId];
            
                int secondaryStructure = int(atomInfo.x);
                int atomSymbolId = int(atomInfo.y);
                int residueSymbolId = int(atomInfo.z);
                int chainSymbolId = int(atomInfo.w);
            
                int numChains = int(IngredientInfo[ingredientId].y);
            
                //predefined colors
                //atomSymbolId = 2;
                vec3 atomColor = AtomColors[atomSymbolId];
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
            
                //inital Hue-Chroma-Luminance
                float h = ingredientGroupsColorValues.x + (ingredientGroupsColorRanges.x) * (ingredientLocalIndex - 0.5f);
                float c = ingredientGroupsColorValues.y + (ingredientGroupsColorRanges.y) * (ingredientLocalIndex - 0.5f);
                float l = ingredientGroupsColorValues.z + (ingredientGroupsColorRanges.z) * (ingredientLocalIndex - 0.5f);
            
                vec3 hcl = rgb_to_hcv(col.xyz*20);
                h = hcl.r;
                c = hcl.g+10;
                l = hcl.b+10;
                //h = 120;
                //c = 80;
                //l = 50;
            
                h = IngredientColorHCL[ingredientId].x;
                c = IngredientColorHCL[ingredientId].y;
                l = IngredientColorHCL[ingredientId].z;
            
            
                //if(false)
                if(eyeDepth < chainBeginDistance)
                {
                    float cc = max(eyeDepth - atomicBeginDistance, 0);
                    float dd = chainBeginDistance - atomicBeginDistance;
                    float ddd = (1-(cc/dd));
                    if(atomSymbolId > 0) l -= 13 * ddd;
                }
            
                //if(false)
                if(eyeDepth < chainBeginDistance && numChains > 1)
                {
                    float cc = max(eyeDepth - atomicBeginDistance, 0);
                    float dd = chainBeginDistance - atomicBeginDistance;
                    float ddd = (1-(cc/dd));
            
                    float wedge = min(50 * numChains, 180);
                    // float hueShift = wedge / numChains;
                    // hueShift *= ddd;
                    float hueShift = 50;
                    hueShift = numChains >= 3 ? 50 : hueShift;
                    hueShift = numChains >= 4 ? 50 : hueShift;
                    hueShift = numChains >= 5 ? 50 : hueShift;
                    hueShift = numChains >= 6 ? 50 : hueShift;
                    hueShift = numChains >= 7 ? 40 : hueShift;
                    hueShift = numChains >= 8 ? 30 : hueShift;
                    hueShift = numChains >= 9 ? 30 : hueShift;
                    hueShift = numChains >= 10 ? 15 : hueShift;
                    hueShift = numChains >= 11 ? 10 : hueShift;
                    hueShift = numChains >= 12 ? 10 : hueShift;
                    hueShift *= (1-(cc/dd));
            
                    float hueLength = hueShift * (numChains - 1);
                    float hueOffset = hueLength * 0.5;
            
                    h -=  hueOffset;
                    h += (chainSymbolId * hueShift);
                }
            
              c -= 15;
            
                vec3 color;
                color = d3_hcl_lab(h, c, l);
                color = max(color, vec3(0,0,0));
                color = min(color, vec3(1,1,1));
            
                if(eyeDepth < atomicBeginDistance)
                {
                    float t = (eyeDepth/atomicBeginDistance);
                    t = 1.0 - clamp(t, 0.0, 1.0);
                    color.xyz = mix(color.xyz, atomColor, t);
                    //color.xyz = atomColor;
                }
            
              out_color = vec4(occ1 * occ2 * color.xyz, 1.0);
              //~ for debug: depth
              //out_color = vec4(eyeDepth, eyeDepth, eyeDepth, 1.0);
              //out_color = vec4(occ1 * occ2 * col.xyz, 1.0);
                //out_color = vec4(vec3(residueSymbolId), 1.0);
                //out_color = vec4(vec3(instanceId), 1.0);
                //out_color = vec4(vec3(numChains*0.01f,0,0), 1.0);
            
                //out_color = vec4(aminoAcidColor, 1.0);
                //out_color = vec4(vec3(chainSymbolId*0.5), 1.0);
            }
            
            `
        });
    }
    resize(x, y) {

    }
    render(renderer) {

    }
}

export default CompositePass;