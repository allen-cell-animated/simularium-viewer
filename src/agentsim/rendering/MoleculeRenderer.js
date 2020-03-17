import SSAO1Pass from "./SSAO";
import MoleculePass from "./MoleculePass";
import BlurPass from "./GaussianBlur";
import CompositePass from "./CompositePass";
import ContourPass from "./ContourPass";
import DrawBufferPass from "./DrawBufferPass";

import * as dat from "dat.gui";

class MoleculeRenderer {
    constructor() {
        this.gbufferPass = new MoleculePass();
        // radius, threshold, falloff in view space coordinates.
        this.ssao1Pass = new SSAO1Pass(4.5, 150, 150);
        this.ssao2Pass = new SSAO1Pass(4.5, 150, 150);
        //        this.ssao1Pass = new SSAO1Pass(0.00005, 0.38505, 0.08333);
        //        this.ssao2Pass = new SSAO1Pass(0.00125, 1.05714, 0.15188);
        this.blur1Pass = new BlurPass(10);
        this.blur2Pass = new BlurPass(10);
        this.compositePass = new CompositePass();
        this.contourPass = new ContourPass();
        this.drawBufferPass = new DrawBufferPass();

        // buffers:
        this.colorBuffer = new THREE.WebGLRenderTarget(2, 2, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType,
            depthBuffer: true,
            stencilBuffer: false,
        });
        this.colorBuffer.texture.generateMipmaps = false;
        // TODO : MRT AND SHARE DEPTH BUFFER among color, position, normal etc
        this.normalBuffer = new THREE.WebGLRenderTarget(2, 2, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType,
            depthBuffer: true,
            stencilBuffer: false,
        });
        this.normalBuffer.texture.generateMipmaps = false;
        this.positionBuffer = new THREE.WebGLRenderTarget(2, 2, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType,
            depthBuffer: true,
            stencilBuffer: false,
        });
        this.positionBuffer.texture.generateMipmaps = false;

        // intermediate blurring buffer
        this.blurIntermediateBuffer = new THREE.WebGLRenderTarget(2, 2, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType,
            depthBuffer: false,
            stencilBuffer: false,
        });
        this.blurIntermediateBuffer.texture.generateMipmaps = false;

        this.ssaoBuffer = new THREE.WebGLRenderTarget(2, 2, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType,
            depthBuffer: false,
            stencilBuffer: false,
        });
        this.ssaoBuffer.texture.generateMipmaps = false;
        this.ssaoBuffer2 = new THREE.WebGLRenderTarget(2, 2, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType,
            depthBuffer: false,
            stencilBuffer: false,
        });
        this.ssaoBuffer2.texture.generateMipmaps = false;
        this.ssaoBufferBlurred = new THREE.WebGLRenderTarget(2, 2, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType,
            depthBuffer: false,
            stencilBuffer: false,
        });
        this.ssaoBufferBlurred.texture.generateMipmaps = false;
        this.ssaoBufferBlurred2 = new THREE.WebGLRenderTarget(2, 2, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType,
            depthBuffer: false,
            stencilBuffer: false,
        });
        this.ssaoBufferBlurred2.texture.generateMipmaps = false;
    }

    setupGui(gui) {
        var settings = {
            aoradius1: 4.5,
            aoradius2: 4.5,
            blurradius1: 10.0,
            blurradius2: 10.0,
            aothreshold1: 150,
            aofalloff1: 150,
            aothreshold2: 150,
            aofalloff2: 150,
            atomBeginDistance: 150.0,
            chainBeginDistance: 200.0,
        };
        var self = this;
        gui.add(settings, "aoradius1", 0.01, 10.0).onChange(value => {
            self.ssao1Pass.pass.material.uniforms.radius.value = value;
        });
        gui.add(settings, "blurradius1", 0.01, 10.0).onChange(value => {
            self.blur1Pass.setRadius(value);
        });
        gui.add(settings, "aothreshold1", 0.01, 300.0).onChange(value => {
            self.ssao1Pass.pass.material.uniforms.ssao_threshold.value = value;
        });
        gui.add(settings, "aofalloff1", 0.01, 300.0).onChange(value => {
            self.ssao1Pass.pass.material.uniforms.ssao_falloff.value = value;
        });
        gui.add(settings, "aoradius2", 0.01, 10.0).onChange(value => {
            self.ssao2Pass.pass.material.uniforms.radius.value = value;
        });
        gui.add(settings, "blurradius2", 0.01, 10.0).onChange(value => {
            self.blur2Pass.setRadius(value);
        });
        gui.add(settings, "aothreshold2", 0.01, 300.0).onChange(value => {
            self.ssao2Pass.pass.material.uniforms.ssao_threshold.value = value;
        });
        gui.add(settings, "aofalloff2", 0.01, 300.0).onChange(value => {
            self.ssao2Pass.pass.material.uniforms.ssao_falloff.value = value;
        });

        gui.add(settings, "atomBeginDistance", 0.0, 300.0).onChange(value => {
            self.compositePass.pass.material.uniforms.atomicBeginDistance.value = value;
        });
        gui.add(settings, "chainBeginDistance", 0.0, 300.0).onChange(value => {
            self.compositePass.pass.material.uniforms.chainBeginDistance.value = value;
        });
    }

    // TODO this is a geometry/scene update and should be updated through some other means?
    updateMolecules(
        positions,
        typeids,
        instanceids,
        numAgents,
        numAtomsPerAgent
    ) {
        this.gbufferPass.update(
            positions,
            typeids,
            instanceids,
            numAgents * numAtomsPerAgent
        );
    }
    // colorsData is a Float32Array of rgb triples
    updateColors(numColors, colorsData) {
        this.compositePass.updateColors(numColors, colorsData);
    }

    createMoleculeBuffer(n) {
        this.gbufferPass.createMoleculeBuffer(n);
    }

    resize(x, y) {
        this.colorBuffer.setSize(x, y);
        // TODO : MRT AND SHARE DEPTH BUFFER
        this.normalBuffer.setSize(x, y);
        this.positionBuffer.setSize(x, y);
        // intermediate blurring buffer
        this.blurIntermediateBuffer.setSize(x, y);
        this.ssaoBuffer.setSize(x, y);
        this.ssaoBuffer2.setSize(x, y);
        this.ssaoBufferBlurred.setSize(x, y);
        this.ssaoBufferBlurred2.setSize(x, y);

        this.gbufferPass.resize(x, y);
        this.ssao1Pass.resize(x, y);
        this.ssao2Pass.resize(x, y);
        this.blur1Pass.resize(x, y);
        this.blur2Pass.resize(x, y);
        this.compositePass.resize(x, y);
        this.contourPass.resize(x, y);
        this.drawBufferPass.resize(x, y);
    }

    render(renderer, camera, target) {
        // TODO : DEPTH HANDLING STRATEGY:
        // gbuffer pass writes gl_FragDepth
        // depth buffer should be not written to or tested again after this.
        // depth buffer should be maintained and transferred to final render pass so that other standard geometry can be drawn

        // 1 draw molecules into G buffers
        // TODO : MRT
        this.gbufferPass.render(
            renderer,
            camera,
            this.colorBuffer,
            this.normalBuffer,
            this.positionBuffer
        );

        // 2 render ssao
        this.ssao1Pass.render(
            renderer,
            camera,
            this.ssaoBuffer,
            this.normalBuffer,
            this.positionBuffer
        );
        this.blur1Pass.render(
            renderer,
            this.ssaoBufferBlurred,
            this.ssaoBuffer,
            this.positionBuffer,
            this.blurIntermediateBuffer
        );

        this.ssao2Pass.render(
            renderer,
            camera,
            this.ssaoBuffer2,
            this.normalBuffer,
            this.positionBuffer
        );
        this.blur2Pass.render(
            renderer,
            this.ssaoBufferBlurred2,
            this.ssaoBuffer2,
            this.positionBuffer,
            this.blurIntermediateBuffer
        );

        // render composite pass into normal buffer, overwriting the normals data!
        const compositeTarget = this.normalBuffer;

        // render into default render target
        this.compositePass.render(
            renderer,
            camera,
            compositeTarget,
            this.ssaoBufferBlurred,
            this.ssaoBufferBlurred2,
            this.colorBuffer
        );

        this.contourPass.render(
            renderer,
            target,
            compositeTarget,
            // this is the buffer with the instance ids
            this.colorBuffer
        );

        //this.drawBufferPass.render(renderer, target, this.colorBuffer);
        //this.drawBufferPass.render(renderer, target, this.ssaoBuffer);
        //this.drawBufferPass.render(renderer, target, this.ssaoBuffer2);
        //this.drawBufferPass.render(renderer, target, this.normalBuffer);
        //this.drawBufferPass.setScale(1.0/150.0, 1.0/150.0, 1.0/150.0, 1.0/150.0);
        //this.drawBufferPass.render(renderer, target, this.positionBuffer);
    }
}

export default MoleculeRenderer;
