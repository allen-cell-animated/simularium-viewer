import {
    Color,
    Material,
    Mesh,
    MeshBasicMaterial,
    MeshLambertMaterial,
    Object3D,
    ShaderMaterial,
    SphereBufferGeometry,
    Vector2,
    WebGLRenderer,
} from "three";

import MembraneShader from "./rendering/MembraneShader";
import PDBModel from "./PDBModel";

function desaturate(color: Color): Color {
    const desatColor = new Color(color);
    let hsl: {
        h: number;
        s: number;
        l: number;
    } = { h: 0, s: 0, l: 0 };
    hsl = desatColor.getHSL(hsl);
    desatColor.setHSL(hsl.h, 0.5 * hsl.s, hsl.l);
    return desatColor;
}

export default class AgentMesh {
    public static UNASSIGNED_MESH_COLOR = 0xff00ff;
    public static sphereGeometry: SphereBufferGeometry = new SphereBufferGeometry(
        1,
        32,
        32
    );
    private static highlightMaterial: MeshBasicMaterial = new MeshBasicMaterial(
        {
            color: new Color(1, 0, 0),
        }
    );
    private static membraneData: {
        faces: { name: string }[];
        sides: { name: string }[];
        facesMaterial: ShaderMaterial;
        sidesMaterial: ShaderMaterial;
        facesUVScale: Vector2;
        sidesUVScale: Vector2;
    } = {
        faces: [{ name: "curved_5nm_Right" }, { name: "curved_5nm_Left" }],
        sides: [
            { name: "curved_5nm_Bottom" },
            { name: "curved_5nm_Top" },
            { name: "curved_5nm_Back" },
            { name: "curved_5nm_Front" },
        ],
        facesMaterial: MembraneShader.MembraneShader.clone(),
        sidesMaterial: MembraneShader.MembraneShader.clone(),
        facesUVScale: new Vector2(40.0, 40.0),
        sidesUVScale: new Vector2(2.0, 40.0),
    };
    public static updateMembrane(time: number, renderer: WebGLRenderer): void {
        AgentMesh.membraneData.facesMaterial.uniforms.iTime.value = time;
        AgentMesh.membraneData.sidesMaterial.uniforms.iTime.value = time;

        renderer.getDrawingBufferSize(
            AgentMesh.membraneData.facesMaterial.uniforms.iResolution.value
        );
        renderer.getDrawingBufferSize(
            AgentMesh.membraneData.sidesMaterial.uniforms.iResolution.value
        );
    }

    public mesh: Object3D;
    // TODO can this default to a trivial single-atom pdb model?
    public pdbModel?: PDBModel;
    public pdbObjects: Object3D[];
    public lod: number;
    public agentIndex: number;
    public typeId: number;
    public colorIndex: number;
    public active: boolean;
    public baseMaterial: Material;
    public desatMaterial: Material;
    public color: Color;
    public name: string;
    public highlighted: boolean;
    public selected: boolean;

    public constructor(name: string) {
        this.name = name;
        this.color = new Color(AgentMesh.UNASSIGNED_MESH_COLOR);
        this.active = false;
        this.agentIndex = -1;
        this.typeId = -1;
        this.colorIndex = 0;
        this.highlighted = false;
        // all are selected by default.  deselecting will desaturate.
        this.selected = true;
        this.baseMaterial = new MeshLambertMaterial({
            color: new Color(this.color),
        });
        this.desatMaterial = new MeshBasicMaterial({
            color: desaturate(this.color),
        });
        this.mesh = new Mesh(AgentMesh.sphereGeometry, this.baseMaterial);
        this.mesh.userData = { index: this.agentIndex };
        this.mesh.visible = false;

        this.pdbModel = undefined;
        this.pdbObjects = [];
        this.lod = 0;
    }

    public resetMesh(): void {
        this.mesh = new Mesh(AgentMesh.sphereGeometry, this.baseMaterial);
        this.mesh.userData = { index: this.agentIndex };
        this.highlighted = false;
        this.selected = true;
        this.setColor(AgentMesh.UNASSIGNED_MESH_COLOR);
    }

    public setColor(color, colorIndex = 0): void {
        this.color = color;
        this.colorIndex = colorIndex;
        this.baseMaterial = new MeshLambertMaterial({
            color: new Color(this.color),
        });
        this.desatMaterial = new MeshBasicMaterial({
            color: desaturate(this.color),
        });
        // because this is a new material, we need to re-install it on the geometry
        // TODO deal with highlight and selection state
        this.assignMaterial();
    }

    public setHighlighted(highlighted: boolean): void {
        this.highlighted = highlighted;
        this.assignMaterial();
    }

    public setSelected(selected: boolean): void {
        this.selected = selected;
        this.assignMaterial();
    }

    private assignMaterial(): void {
        if (this.mesh.name.includes("membrane")) {
            return this.assignMembraneMaterial();
        }

        let material = this.desatMaterial;
        if (this.highlighted) {
            material = AgentMesh.highlightMaterial;
        } else if (this.selected) {
            material = this.baseMaterial;
        }

        for (let i = 0; i < this.pdbObjects.length; ++i) {
            this.pdbObjects[
                i
            ].onBeforeRender = this.onAgentMeshBeforeRender.bind(this);
        }
        if (this.mesh instanceof Mesh) {
            this.mesh.material = material;
            this.mesh.onBeforeRender = this.onAgentMeshBeforeRender.bind(this);
        } else {
            this.mesh.traverse(child => {
                if (child instanceof Mesh) {
                    child.material = material;
                    child.onBeforeRender = this.onAgentMeshBeforeRender.bind(
                        this
                    );
                }
            });
        }
    }

    public assignMembraneMaterial(): void {
        if (this.selected) {
            // at this time, assign separate material parameters to the faces and sides of the membrane
            const faceNames = AgentMesh.membraneData.faces.map(el => {
                return el.name;
            });
            const sideNames = AgentMesh.membraneData.sides.map(el => {
                return el.name;
            });
            this.mesh.traverse(child => {
                if (child instanceof Mesh) {
                    if (faceNames.includes(child.name)) {
                        child.material = AgentMesh.membraneData.facesMaterial;
                    } else if (sideNames.includes(child.name)) {
                        child.material = AgentMesh.membraneData.sidesMaterial;
                    }
                }
            });
            AgentMesh.membraneData.facesMaterial.uniforms.uvscale.value =
                AgentMesh.membraneData.facesUVScale;
            AgentMesh.membraneData.sidesMaterial.uniforms.uvscale.value =
                AgentMesh.membraneData.sidesUVScale;
        } else {
            this.mesh.traverse(child => {
                if (child instanceof Mesh) {
                    child.material = this.desatMaterial;
                }
            });
        }
    }

    private onAgentMeshBeforeRender(
        this: AgentMesh,
        renderer,
        scene,
        camera,
        geometry,
        material
        /* group */
    ): void {
        if (!material.uniforms) {
            return;
        }
        // colorIndex is not necessarily equal to typeId but is generally a 1-1 mapping.
        if (material.uniforms.IN_typeId) {
            material.uniforms.IN_typeId.value = this.colorIndex;
            material.uniformsNeedUpdate = true;
        }
        if (material.uniforms.IN_instanceId) {
            material.uniforms.IN_instanceId.value = Number(this.agentIndex);
            material.uniformsNeedUpdate = true;
        }
        if (material.uniforms.radius) {
            material.uniforms.radius.value = (this.lod + 1) * 0.25; // * 8;
            material.uniformsNeedUpdate = true;
        }
    }

    public setupMeshGeometry(meshGeom): void {
        // remember current transform
        const p = this.mesh.position;
        const r = this.mesh.rotation;
        const s = this.mesh.scale;

        const visible = this.mesh.visible;

        this.mesh = meshGeom.clone();
        this.mesh.userData = { index: this.agentIndex };

        this.mesh.visible = visible;
        // restore transform
        this.mesh.position.copy(p);
        this.mesh.rotation.copy(r);
        this.mesh.scale.copy(s);

        this.assignMaterial();
    }

    public setupPdb(pdb): void {
        this.pdbModel = pdb;
        this.pdbObjects = pdb.instantiate();
    }

    public selectLOD(index): void {
        this.setPDBInvisible();
        if (index < 0 || index >= this.pdbObjects.length) {
            index = this.pdbObjects.length - 1;
        }
        this.lod = index;
        this.pdbObjects[index].visible = true;
    }

    public setPDBInvisible(): void {
        for (let j = 0; j < this.pdbObjects.length; ++j) {
            this.pdbObjects[j].visible = false;
        }
    }
}
