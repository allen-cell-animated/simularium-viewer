import RenderToBuffer from "./RenderToBuffer";

class ContourPass {
    public pass: RenderToBuffer;

    public constructor() {
        this.pass = new RenderToBuffer({
            uniforms: {
                colorTex: { value: null },
                instanceIdTex: { value: null },
            },
            fragmentShader: `
            in vec2 vUv;
            
            uniform sampler2D colorTex;
            uniform sampler2D instanceIdTex;

            void main(void)
            {
              vec4 col = texture(colorTex, vUv);
              //output_col = col;
              //return;
            
              ivec2 resolution = textureSize(colorTex, 0);
            
              vec2 pixelPos = vUv * vec2(float(resolution.x), float(resolution.y));
              float wStep = 1.0 / float(resolution.x);
              float hStep = 1.0 / float(resolution.y);
            
              vec4 instance = texture(instanceIdTex, vUv);
              int X = int(instance.g);
              int R = int(texture(instanceIdTex, vUv + vec2(wStep, 0)).g);
              int L = int(texture(instanceIdTex, vUv + vec2(-wStep, 0)).g);
              int T = int(texture(instanceIdTex, vUv + vec2(0, hStep)).g);
              int B = int(texture(instanceIdTex, vUv + vec2(0, -hStep)).g);
            
              vec4 finalColor;
              if ( (X == R) && (X == L) && (X == T) && (X == B) )
              { //~ current pixel is NOT on the edge
                finalColor = col;
              }
              else
              { //~ current pixel lies on the edge
                finalColor = mix(vec4(0,0,0,1), col, 0.8);
              }
            
              gl_FragDepth = instance.w >= 0.0 ? instance.w : 1.0;
              gl_FragColor = finalColor;
            }
            `,
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public resize(x, y): void {}

    public render(renderer, target, colorBuffer, instanceIdBuffer): void {
        // this render pass has to fill frag depth for future render passes
        this.pass.material.depthWrite = true;
        this.pass.material.depthTest = true;
        this.pass.material.uniforms.colorTex.value = colorBuffer.texture;
        this.pass.material.uniforms.instanceIdTex.value =
            instanceIdBuffer.texture;

        // const c = renderer.getClearColor().clone();
        // const a = renderer.getClearAlpha();
        // renderer.setClearColor(new THREE.Color(1.0, 0.0, 0.0), 1.0);

        this.pass.render(renderer, target);

        // renderer.setClearColor(c, a);
    }
}

export default ContourPass;