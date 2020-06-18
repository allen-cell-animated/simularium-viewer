import MeshGBufferShaders from "./MeshGBufferShaders";
import MoleculeGBufferShaders from "./MoleculeGBufferShaders";
import PDBGBufferShaders from "./PDBGBufferShaders";

import { Color, Group, ShaderMaterial, Vector2, Scene } from "three";

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

// draw positions, normals, and instance and type ids of objects
class GBufferPass {
    public colorMaterial: ShaderMaterial;
    public normalMaterial: ShaderMaterial;
    public positionMaterial: ShaderMaterial;
    public colorMaterialMesh: ShaderMaterial;
    public normalMaterialMesh: ShaderMaterial;
    public positionMaterialMesh: ShaderMaterial;
    public colorMaterialPDB: ShaderMaterial;
    public normalMaterialPDB: ShaderMaterial;
    public positionMaterialPDB: ShaderMaterial;
    public scene: Scene;
    public agentMeshGroup: Group;
    public agentPDBGroup: Group;
    public agentFiberGroup: Group;

    public constructor() {
        this.agentMeshGroup = new Group();
        this.agentPDBGroup = new Group();
        this.agentFiberGroup = new Group();

        this.colorMaterial = MoleculeGBufferShaders.colorMaterial;
        this.normalMaterial = MoleculeGBufferShaders.normalMaterial;
        this.positionMaterial = MoleculeGBufferShaders.positionMaterial;

        this.colorMaterialMesh = MeshGBufferShaders.colorMaterial;
        this.normalMaterialMesh = MeshGBufferShaders.normalMaterial;
        this.positionMaterialMesh = MeshGBufferShaders.positionMaterial;

        this.colorMaterialPDB = PDBGBufferShaders.colorMaterial;
        this.normalMaterialPDB = PDBGBufferShaders.normalMaterial;
        this.positionMaterialPDB = PDBGBufferShaders.positionMaterial;

        this.scene = new Scene();
    }

    public setMeshGroups(
        agentMeshGroup: Group,
        agentPDBGroup: Group,
        agentFiberGroup: Group
    ): void {
        this.agentMeshGroup = agentMeshGroup;
        this.agentPDBGroup = agentPDBGroup;
        this.agentFiberGroup = agentFiberGroup;
    }

    public setAtomRadius(r): void {
        this.colorMaterial.uniforms.radius.value = r;
        this.normalMaterial.uniforms.radius.value = r;
        this.positionMaterial.uniforms.radius.value = r;
        this.colorMaterialPDB.uniforms.radius.value = r;
        this.normalMaterialPDB.uniforms.radius.value = r;
        this.positionMaterialPDB.uniforms.radius.value = r;
    }

    public resize(width, height): void {
        this.colorMaterial.uniforms.iResolution.value = new Vector2(
            width,
            height
        );
        this.normalMaterial.uniforms.iResolution.value = new Vector2(
            width,
            height
        );
        this.positionMaterial.uniforms.iResolution.value = new Vector2(
            width,
            height
        );
        this.colorMaterialPDB.uniforms.iResolution.value = new Vector2(
            width,
            height
        );
        this.normalMaterialPDB.uniforms.iResolution.value = new Vector2(
            width,
            height
        );
        this.positionMaterialPDB.uniforms.iResolution.value = new Vector2(
            width,
            height
        );
    }

    public render(
        renderer,
        scene,
        camera,
        colorBuffer,
        normalBuffer,
        positionBuffer
    ): void {
        const c = renderer.getClearColor().clone();
        const a = renderer.getClearAlpha();
        // alpha == -1 is a marker to discard pixels later
        renderer.setClearColor(new Color(0.0, 0.0, 0.0), -1.0);

        this.colorMaterial.uniforms.projectionMatrix.value =
            camera.projectionMatrix;
        this.normalMaterial.uniforms.projectionMatrix.value =
            camera.projectionMatrix;
        this.positionMaterial.uniforms.projectionMatrix.value =
            camera.projectionMatrix;

        this.colorMaterialMesh.uniforms.projectionMatrix.value =
            camera.projectionMatrix;
        this.normalMaterialMesh.uniforms.projectionMatrix.value =
            camera.projectionMatrix;
        this.positionMaterialMesh.uniforms.projectionMatrix.value =
            camera.projectionMatrix;

        this.colorMaterialPDB.uniforms.projectionMatrix.value =
            camera.projectionMatrix;
        this.normalMaterialPDB.uniforms.projectionMatrix.value =
            camera.projectionMatrix;
        this.positionMaterialPDB.uniforms.projectionMatrix.value =
            camera.projectionMatrix;

        // 1. fill colorbuffer

        renderer.setRenderTarget(colorBuffer);

        this.agentMeshGroup.visible = true;
        this.agentFiberGroup.visible = true;
        this.agentPDBGroup.visible = false;

        scene.overrideMaterial = this.colorMaterialMesh;
        renderer.render(scene, camera);

        renderer.autoClear = false;

        this.agentMeshGroup.visible = false;
        this.agentFiberGroup.visible = false;
        this.agentPDBGroup.visible = true;

        scene.overrideMaterial = this.colorMaterialPDB;
        renderer.render(scene, camera);

        renderer.autoClear = true;

        // 2. fill normalbuffer

        renderer.setRenderTarget(normalBuffer);

        this.agentMeshGroup.visible = true;
        this.agentFiberGroup.visible = true;
        this.agentPDBGroup.visible = false;

        scene.overrideMaterial = this.normalMaterialMesh;
        renderer.render(scene, camera);

        renderer.autoClear = false;

        this.agentMeshGroup.visible = false;
        this.agentFiberGroup.visible = false;
        this.agentPDBGroup.visible = true;

        scene.overrideMaterial = this.normalMaterialPDB;
        renderer.render(scene, camera);

        renderer.autoClear = true;

        // 3. fill positionbuffer

        renderer.setRenderTarget(positionBuffer);

        this.agentMeshGroup.visible = true;
        this.agentFiberGroup.visible = true;
        this.agentPDBGroup.visible = false;

        scene.overrideMaterial = this.positionMaterialMesh;
        renderer.render(scene, camera);

        renderer.autoClear = false;

        this.agentMeshGroup.visible = false;
        this.agentFiberGroup.visible = false;
        this.agentPDBGroup.visible = true;

        scene.overrideMaterial = this.positionMaterialPDB;
        renderer.render(scene, camera);

        renderer.autoClear = true;

        /*


        this.agentMeshGroup.visible = true;
        this.agentFiberGroup.visible = true;
        this.agentPDBGroup.visible = false;

        // TODO : MRT
        renderer.setRenderTarget(colorBuffer);
        scene.overrideMaterial = this.colorMaterialMesh;
        renderer.render(scene, camera);

        renderer.setRenderTarget(normalBuffer);
        scene.overrideMaterial = this.normalMaterialMesh;
        renderer.render(scene, camera);

        renderer.setRenderTarget(positionBuffer);
        scene.overrideMaterial = this.positionMaterialMesh;
        renderer.render(scene, camera);

        renderer.autoClear = false;

        this.agentMeshGroup.visible = false;
        this.agentFiberGroup.visible = false;
        this.agentPDBGroup.visible = true;

        renderer.setRenderTarget(colorBuffer);
        scene.overrideMaterial = this.colorMaterialPDB;
        renderer.render(scene, camera);

        renderer.setRenderTarget(normalBuffer);
        scene.overrideMaterial = this.normalMaterialPDB;
        renderer.render(scene, camera);

        renderer.setRenderTarget(positionBuffer);
        scene.overrideMaterial = this.positionMaterialPDB;
        renderer.render(scene, camera);
*/
        scene.overrideMaterial = null;

        renderer.autoClear = true;
        renderer.setClearColor(c, a);
    }
}

export default GBufferPass;
