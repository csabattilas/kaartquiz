# Iris Quiz

A South America map quiz for a child: she is asked where a Place is and touches the unlabeled map to find it.

## Language

**Place**:
Anything the child can be asked to find on the map; either a Country or a Feature.
_Avoid_: Landmark, location, target

**Country**:
A Place that is an area; a touch anywhere inside its borders is correct.
_Avoid_: Nation, region

**Feature**:
A Place that is a single chosen point (river, mountain range, lake, monument); a touch close enough to the point is correct.
_Avoid_: Landmark, POI

**Territory**:
A drawn area on the map that is never asked about (French Guiana, Falkland Islands); touching it is neutral, not wrong.
_Avoid_: Dependency, colony

**Marker**:
The unlabeled symbol drawn on the map at a Feature's Anchor point; its shape shows the kind of Feature (triangle for mountains, diamond for rivers, circle for water, square for sights, rectangle for areas), and the child touches it to answer.
_Avoid_: Pin, icon, label

**Anchor point**:
The single spot chosen to represent a Feature, placed where it best fits (e.g. mid-course for the Amazon River).
_Avoid_: Pin, marker, coordinates

**Hit radius**:
The distance around a Feature's Anchor point within which a Touch counts as correct, set per Feature.
_Avoid_: Tolerance, threshold

**Region**:
A continent map the child can choose, owning its own Countries, Features and Territories (South America, Asia).
_Avoid_: Continent, map, level

**Custom place**:
A Feature added by the parent in Settings, with a name, an Anchor point tapped on the map and a size that sets its Hit radius.
_Avoid_: User landmark, own landmark

**Round**:
A run of Questions drawn at random, without repeats, from the Places switched on in Settings.
_Avoid_: Game, session, level

**Question**:
One prompt asking the child to find a Place.

**Touch**:
The child's tap on the map in answer to a Question.
_Avoid_: Click, guess

## Relationships

- A **Region** contains **Countries**, **Features** and **Territories**; a **Custom place** belongs to one **Region**
- A **Round** belongs to one **Region**
- A **Place** is either a **Country** or a **Feature**
- A **Territory** is drawn but is never the subject of a **Question**
- A **Feature** has exactly one **Anchor point**
- A **Feature** has exactly one **Marker** at its **Anchor point**; the **Hit radius** only applies when Markers are switched off in Settings
- A **Feature** has exactly one **Hit radius**
- A **Question** asks for exactly one **Place** and is answered by one **Touch**

## Example dialogue

> **Dev:** "When she is asked for the Amazon River, what counts as correct?"
> **Domain expert:** "The Amazon River is a **Feature**, so we judge her **Touch** against its **Anchor point**, placed mid-course."
> **Dev:** "And for Peru?"
> **Domain expert:** "Peru is a **Country**, so any **Touch** inside its borders is correct."

## Flagged ambiguities

- "landmark" was used for everything findable, including whole countries — resolved: the umbrella term is **Place**, split into **Country** (area) and **Feature** (point).
