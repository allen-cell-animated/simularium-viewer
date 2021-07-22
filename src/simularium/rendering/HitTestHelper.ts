import {
    Camera,
    FloatType,
    Mesh,
    NearestFilter,
    OrthographicCamera,
    PlaneGeometry,
    RGBAFormat,
    Scene,
    ShaderMaterial,
    Texture,
    Vector2,
    WebGLRenderer,
    WebGLRenderTarget,
} from "three";

export default class HitTestHelper {
    private hitTestBuffer: WebGLRenderTarget;
    private hitTestScene: Scene;
    private hitTestCamera: Camera;
    private hitTestVertexShader: string;
    private hitTestFragmentShader: string;
    private hitTestMesh: Mesh;

    constructor() {
        this.hitTestBuffer = new WebGLRenderTarget(1, 1, {
            minFilter: NearestFilter,
            magFilter: NearestFilter,
            format: RGBAFormat,
            type: FloatType,
            depthBuffer: false,
            stencilBuffer: false,
        });
        this.hitTestScene = new Scene();
        this.hitTestCamera = new OrthographicCamera();
        this.hitTestVertexShader = `
  
    void main() {
      gl_Position = vec4(position, 1.0);
    }
    `;
        this.hitTestFragmentShader = `
    uniform vec2 pixel;
    uniform sampler2D objectIdTexture;

    void main() {
      gl_FragColor = texture(objectIdTexture, pixel);
    }
    `;
        this.hitTestMesh = new Mesh(
            new PlaneGeometry(2, 2),
            new ShaderMaterial({
                vertexShader: this.hitTestVertexShader,
                fragmentShader: this.hitTestFragmentShader,
                depthWrite: false,
                depthTest: false,
                uniforms: {
                    pixel: { value: new Vector2(0.5, 0.5) },
                    objectIdTexture: { value: null },
                },
            })
        );
        this.hitTestScene.add(this.hitTestMesh);
    }

    public hitTest(
        renderer: WebGLRenderer,
        idBuffer: Texture,
        x: number,
        y: number
    ): Float32Array {
        const pixel = new Float32Array(4).fill(-1);
        // (typeId), (instanceId), fragViewPos.z, fragPosDepth;

        this.hitTestMesh.material.uniforms.objectIdTexture.value = idBuffer;
        this.hitTestMesh.material.uniforms.pixel.value = new Vector2(x, y);
        renderer.setRenderTarget(this.hitTestBuffer);
        renderer.render(this.hitTestScene, this.hitTestCamera);
        renderer.setRenderTarget(null);
        renderer.readRenderTargetPixels(this.hitTestBuffer, 0, 0, 1, 1, pixel);
        return pixel;
    }
}