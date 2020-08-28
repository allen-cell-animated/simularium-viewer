import {
    CatmullRomCurve3,
    Color,
    Group,
    LineCurve3,
    Material,
    Mesh,
    MeshBasicMaterial,
    MeshLambertMaterial,
    Object3D,
    ShaderMaterial,
    SphereBufferGeometry,
    TubeBufferGeometry,
    Vector2,
    Vector3,
    WebGLRenderer,
} from "three";

import MembraneShader from "./rendering/MembraneShader";
import PDBModel from "./PDBModel";
import VisTypes from "./VisTypes";

function desaturate(color: Color): Color {
    const desatColor = new Color(color);
    let hsl: {
        h: number;
        s: number;
        l: number;
    } = { h: 0, s: 0, l: 0 };
    hsl = desatColor.getHSL(hsl);
    desatColor.setHSL(hsl.h, 0.25 * hsl.s, hsl.l);
    return desatColor;
}

export default class VisAgent {
    private static readonly UNASSIGNED_MESH_COLOR = 0xff00ff;
    public static readonly UNASSIGNED_NAME_PREFIX = "Unassigned";
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
    private static hiddenMaterial: MeshBasicMaterial = new MeshBasicMaterial({
        color: new Color(1, 0, 0),
        opacity: 0,
    });
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
        facesMaterial: MembraneShader.membraneShader.clone(),
        sidesMaterial: MembraneShader.membraneShader.clone(),
        facesUVScale: new Vector2(40.0, 40.0),
        sidesUVScale: new Vector2(2.0, 40.0),
    };
    public static updateMembrane(time: number, renderer: WebGLRenderer): void {
        VisAgent.membraneData.facesMaterial.uniforms.iTime.value = time;
        VisAgent.membraneData.sidesMaterial.uniforms.iTime.value = time;

        renderer.getDrawingBufferSize(
            VisAgent.membraneData.facesMaterial.uniforms.iResolution.value
        );
        renderer.getDrawingBufferSize(
            VisAgent.membraneData.sidesMaterial.uniforms.iResolution.value
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
    public hidden: boolean;
    public selected: boolean;
    public visType: number;

    public constructor(name: string) {
        this.visType = VisTypes.ID_VIS_TYPE_DEFAULT;
        this.name = name;
        this.color = new Color(VisAgent.UNASSIGNED_MESH_COLOR);
        this.active = false;
        this.agentIndex = -1;
        this.typeId = -1;
        this.colorIndex = 0;
        this.highlighted = false;
        this.hidden = false;
        // all are selected by default.  deselecting will desaturate.
        this.selected = true;
        this.baseMaterial = new MeshLambertMaterial({
            color: new Color(this.color),
        });
        this.desatMaterial = new MeshBasicMaterial({
            color: desaturate(this.color),
            transparent: true,
            opacity: 0.4,
        });
        this.mesh = new Mesh(VisAgent.sphereGeometry, this.baseMaterial);
        this.mesh.userData = { index: this.agentIndex };
        this.mesh.visible = false;

        this.pdbModel = undefined;
        this.pdbObjects = [];
        this.lod = 0;
    }

    public resetMesh(): void {
        this.visType = VisTypes.ID_VIS_TYPE_DEFAULT;
        this.typeId = -1;
        this.mesh = new Mesh(VisAgent.sphereGeometry, this.baseMaterial);
        this.mesh.userData = { index: this.agentIndex };
        this.highlighted = false;
        this.selected = true;
        this.setColor(new Color(VisAgent.UNASSIGNED_MESH_COLOR));
    }

    public resetPDB(): void {
        this.pdbModel = undefined;
        this.pdbObjects = [];
        this.lod = 0;
    }

    public setColor(color: Color, colorIndex = 0): void {
        this.color = color;
        this.colorIndex = colorIndex;
        this.baseMaterial = new MeshLambertMaterial({
            color: new Color(this.color),
        });
        this.desatMaterial = new MeshBasicMaterial({
            color: desaturate(this.color),
            transparent: true,
            opacity: 0.4,
        });
        // because this is a new material, we need to re-install it on the geometry
        // TODO deal with highlight and selection state
        this.assignMaterial();
    }

    public setVisibility(hidden: boolean): void {
        this.hidden = hidden;
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
        if (this.hidden) {
            material = VisAgent.hiddenMaterial;
        } else if (this.highlighted) {
            material = VisAgent.highlightMaterial;
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
            this.mesh.traverse((child) => {
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
            const faceNames = VisAgent.membraneData.faces.map((el) => {
                return el.name;
            });
            const sideNames = VisAgent.membraneData.sides.map((el) => {
                return el.name;
            });
            this.mesh.traverse((child) => {
                if (child instanceof Mesh) {
                    if (faceNames.includes(child.name)) {
                        child.material = VisAgent.membraneData.facesMaterial;
                    } else if (sideNames.includes(child.name)) {
                        child.material = VisAgent.membraneData.sidesMaterial;
                    }
                }
            });
            VisAgent.membraneData.facesMaterial.uniforms.uvscale.value =
                VisAgent.membraneData.facesUVScale;
            VisAgent.membraneData.sidesMaterial.uniforms.uvscale.value =
                VisAgent.membraneData.sidesUVScale;
        } else {
            this.mesh.traverse((child) => {
                if (child instanceof Mesh) {
                    child.material = this.desatMaterial;
                }
            });
        }
    }

    private onAgentMeshBeforeRender(
        this: VisAgent,
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
        if (material.uniforms.typeId) {
            // negate the value if deselected.
            // by default everything is selected.
            // see implementation in CompositePass.ts for how the value is interpreted
            material.uniforms.typeId.value =
                this.colorIndex * (this.selected ? 1 : -1);
            material.uniformsNeedUpdate = true;
        }
        if (material.uniforms.instanceId) {
            material.uniforms.instanceId.value = Number(this.agentIndex);
            material.uniformsNeedUpdate = true;
        }
        if (material.uniforms.radius) {
            material.uniforms.radius.value = (this.lod + 1) * 0.25; // * 8;
            material.uniformsNeedUpdate = true;
        }
    }

    public setupMeshGeometry(meshGeom: Object3D): void {
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

    public setupPdb(pdb: PDBModel): void {
        this.pdbModel = pdb;
        this.pdbObjects = pdb.instantiate();

        this.assignMaterial();
    }

    public selectLOD(index: number): void {
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

    public hideAndDeactivate(): void {
        this.mesh.visible = false;
        this.setPDBInvisible();
        this.active = false;
    }

    public hasDrawablePDB(): boolean {
        return (
            this.pdbModel !== undefined &&
            this.pdbModel.pdb !== null &&
            this.pdbObjects.length > 0 &&
            !this.pdbModel.name.startsWith(VisAgent.UNASSIGNED_NAME_PREFIX)
        );
    }

    public updateFiber(
        subpoints: number[],
        collisionRadius: number,
        scale: number
    ): void {
        // assume a known structure.
        // first child is fiber
        // second and third children are endcaps

        if (this.mesh.children.length !== 3) {
            console.error("Bad mesh structure for fiber");
            return;
        }

        // put all the subpoints into a Vector3[]
        const curvePoints: Vector3[] = [];
        const numSubPoints = subpoints.length;
        if (numSubPoints % 3 !== 0) {
            console.warn(
                "Warning, subpoints array does not contain a multiple of 3"
            );
            return;
        }
        for (let j = 0; j < numSubPoints; j += 3) {
            const x = subpoints[j];
            const y = subpoints[j + 1];
            const z = subpoints[j + 2];
            curvePoints.push(new Vector3(x, y, z));
        }

        // set up new fiber as curved tube
        const fibercurve = new CatmullRomCurve3(curvePoints);
        const fibergeometry = new TubeBufferGeometry(
            fibercurve,
            (4 * numSubPoints) / 3,
            collisionRadius * scale * 0.5,
            8,
            false
        );

        (this.mesh.children[0] as Mesh).geometry = fibergeometry;

        // update transform of endcap 0
        const runtimeFiberEncapMesh0 = this.mesh.children[1] as Mesh;
        runtimeFiberEncapMesh0.position.x = curvePoints[0].x;
        runtimeFiberEncapMesh0.position.y = curvePoints[0].y;
        runtimeFiberEncapMesh0.position.z = curvePoints[0].z;
        runtimeFiberEncapMesh0.scale.x = collisionRadius * scale * 0.5;
        runtimeFiberEncapMesh0.scale.y = collisionRadius * scale * 0.5;
        runtimeFiberEncapMesh0.scale.z = collisionRadius * scale * 0.5;

        // update transform of endcap 1
        const runtimeFiberEncapMesh1 = this.mesh.children[2] as Mesh;
        runtimeFiberEncapMesh1.position.x =
            curvePoints[curvePoints.length - 1].x;
        runtimeFiberEncapMesh1.position.y =
            curvePoints[curvePoints.length - 1].y;
        runtimeFiberEncapMesh1.position.z =
            curvePoints[curvePoints.length - 1].z;
        runtimeFiberEncapMesh1.scale.x = collisionRadius * scale * 0.5;
        runtimeFiberEncapMesh1.scale.y = collisionRadius * scale * 0.5;
        runtimeFiberEncapMesh1.scale.z = collisionRadius * scale * 0.5;
    }

    // make a single generic fiber and return it
    public static makeFiber(): Group {
        const fibercurve = new LineCurve3(
            new Vector3(0, 0, 0),
            new Vector3(1, 1, 1)
        );
        const geometry = new TubeBufferGeometry(fibercurve, 1, 1, 1, false);
        const fiberMesh = new Mesh(geometry);
        fiberMesh.name = `Fiber`;

        const fiberEndcapMesh0 = new Mesh(VisAgent.sphereGeometry);
        fiberEndcapMesh0.name = `FiberEnd0`;

        const fiberEndcapMesh1 = new Mesh(VisAgent.sphereGeometry);
        fiberEndcapMesh1.name = `FiberEnd1`;

        const fiberGroup = new Group();
        fiberGroup.add(fiberMesh);
        fiberGroup.add(fiberEndcapMesh0);
        fiberGroup.add(fiberEndcapMesh1);
        // downstream code will switch this flag
        fiberGroup.visible = false;
        return fiberGroup;
    }
}
