// The words a share code is made of: the English BIP-39 list (MIT, from @scure/bip39), kept to words of 3 to 7 letters
// with the harsh and unhappy ones taken out, because a code gets read out loud to a friend. Short, common, and no two
// share their first four letters, so a word that was misheard or half typed still points at one answer.
// Changing this list changes which words mean what, so a code made by an older Frameling would stop working: add to the
// end of it and never reorder.
export const WORDS: readonly string[] = `
abandon ability able about above absent absorb absurd access account achieve acid acquire across act action
actor actress actual adapt add address adjust admit adult advance advice aerobic affair afford afraid again
age agent agree ahead aim air airport aisle alarm album alert alien all alley allow almost alone alpha
already also alter always amateur amazing among amount amused analyst anchor ancient angle animal ankle
annual another answer antenna antique anxiety any apart apology appear apple approve april arch arctic area
arena argue arm armed armor army around arrange arrive arrow art artist artwork ask aspect asset assist
assume asthma athlete atom attend attract auction audit august aunt author auto autumn average avocado avoid
awake aware away awesome awful awkward axis baby bacon badge bag balance balcony ball bamboo banana banner
bar barely bargain barrel base basic basket battle beach bean beauty because become beef before begin behave
behind believe below belt bench benefit best betray better between beyond bicycle bid bike bind biology bird
birth black blade blanket blast bleak bless blind blossom blouse blue blur blush board boat body boil bone
bonus book boost border boring borrow boss bottom bounce box boy bracket brain brand brass brave bread
breeze brick bridge brief bright bring brisk broken bronze broom brother brown brush bubble buddy budget
buffalo build bulb bulk bundle bunker burger burst bus busy butter buyer buzz cabbage cabin cable cactus
cage cake call calm camera camp can canal cancel candy cannon canoe canvas canyon capable capital captain
car carbon card cargo carpet carry cart case cash casino castle casual cat catalog catch cattle caught cause
caution cave ceiling celery cement census century cereal certain chair chalk change chapter charge chase
chat cheap check cheese chef cherry chest chicken chief child chimney choice choose chronic chuckle chunk
churn circle citizen city civil claim clap clarify claw clay clean clerk clever click client cliff climb
clinic clip clock clog close cloth cloud clown club clump cluster clutch coach coast coconut code coffee
coil coin collect color column combine come comfort comic common company concert conduct confirm connect
control cook cool copper copy coral core corn correct cost cotton couch country couple course cousin cover
coyote crack cradle craft cram crane crater crawl crazy cream credit creek crew cricket crisp critic crop
cross crouch crowd crucial cruise crumble crunch cry crystal cube culture cup curious current curtain curve
cushion custom cute cycle dad damage damp dance daring dash dawn day deal debate decade decide deer defense
define degree delay deliver demand denial dentist deny depart depend deposit depth deputy derive desert
design desk detail detect develop device devote diagram dial diamond diary dice diesel diet differ digital
dignity dilemma dinner direct dirt dish dismiss display divert divide dizzy doctor dog doll dolphin domain
donate donkey donor door dose double dove draft dragon drastic draw dream dress drift drill drink drip drive
drop drum dry duck dumb dune during dust dutch duty dwarf dynamic eager eagle early earn earth easily east
easy echo ecology economy edge edit educate effort egg eight either elbow elder elegant element elite else
embark embody embrace emerge emotion employ empower empty enable enact end endless endorse enemy energy
enforce engage engine enhance enjoy enlist enough enrich enroll ensure enter entire entry episode equal
equip era erosion erupt essay essence estate eternal ethics evoke evolve exact example excess excite exclude
excuse execute exhaust exhibit exist exit exotic expand expect expire explain express extend extra eye
eyebrow fabric face faculty fade faint faith fall false fame family famous fan fancy fantasy farm fashion
fat father feature federal fee feed feel female fence fetch fever few fiber fiction field figure file film
filter final find fine finger finish fire firm first fiscal fish fit fitness fix flag flame flash flat
flavor flight flip float flock floor flower fluid flush fly foam focus fog foil fold follow food foot force
forest fork fortune forum forward fossil foster found fox frame fresh friend fringe frog front frost frown
frozen fruit fuel fun funny furnace future gadget gain galaxy gallery game gap garage garbage garden garlic
garment gas gasp gate gather gauge gaze general genius genre gentle genuine gesture giant gift giggle ginger
giraffe girl give glad glance glare glass glide glimpse globe gloom glory glove glow glue goat goddess gold
good goose gorilla gospel gossip govern gown grab grace grain grant grape grass gravity great green grid
grit grocery group grow grunt guard guess guide guitar gym habit hair half hammer hamster hand happy harbor
hard harvest hat have hawk head health heart heavy height hello helmet help hen hero hidden high hill hint
hip hire history hobby hockey hold hole holiday hollow home honey hood hope horn horse host hotel hour hover
hub huge human humble humor hundred hungry hunt hurdle hurry husband hybrid ice icon idea idle ignore ill
illness image imitate immense immune impact impose improve impulse inch include income index indoor infant
inflict inform inhale inherit initial inject inmate inner input inquiry insane insect inside inspire install
intact into invest invite involve iron island isolate issue item ivory jacket jaguar jar jazz jealous jeans
jelly jewel job join joke journey joy judge juice jump jungle junior junk just keen keep ketchup key kick
kid kidney kind kingdom kiss kit kitchen kite kitten kiwi knee knock know lab label labor ladder lady lake
lamp laptop large later latin laugh laundry lava law lawn layer lazy leader leaf learn leave lecture left
leg legal legend leisure lemon lend length lens leopard lesson letter level liberty library license life
lift light like limb limit link lion liquid list little live lizard load loan lobster local lock logic long
loop lottery loud lounge love loyal lucky luggage lumber lunar lunch luxury lyrics machine magic magnet maid
mail main major make mammal man manage mandate mango mansion manual maple marble march margin marine market
mask mass master match math matrix matter maximum maze meadow mean measure meat medal media melody melt
member memory mention menu mercy merge merit merry mesh message metal method middle milk million mimic mind
minimum minor minute miracle mirror miss mix mixed mixture mobile model modify mom moment monitor monkey
monster month moon moral more morning mother motion motor mouse move movie much muffin mule museum music
must mutual myself mystery myth naive name napkin narrow nation nature near neck need neglect neither nephew
nest net network neutral never news next nice night noble noise nominee noodle normal north nose notable
note nothing notice novel now nuclear number nurse nut oak object oblige obscure observe obtain obvious
occur ocean october odor off offer office often oil okay old olive olympic once one onion online only open
opera opinion oppose option orange orbit orchard order organ orient orphan ostrich other outdoor outer
output outside oval oven over own owner oxygen oyster ozone pact paddle page pair palace palm panda panel
panther paper parade parent park parrot party pass patch path patient patrol pattern pause pave payment
peace peanut pear peasant pelican pen pencil people pepper perfect permit person pet phone photo phrase
piano picnic picture piece pig pigeon pilot pink pioneer pipe pistol pitch pizza place planet plastic plate
play please pledge pluck plug plunge poem poet point polar pole police pond pony pool popular portion post
potato pottery powder power praise predict prefer prepare present pretty prevent price pride primary print
private prize problem process produce profit program project promote proof prosper protect proud provide
public pudding pull pulp pulse pumpkin pupil puppy purity purpose purse push put puzzle pyramid quality
quantum quarter quick quit quiz quote rabbit raccoon race rack radar radio rail rain raise rally ramp ranch
random range rapid rare rate rather raven raw razor ready real reason rebuild recall receive recipe record
recycle reduce reflect reform region regular relax release relief rely remain remind remove render renew
rent reopen repair repeat replace report require rescue result retire retreat return reunion reveal review
reward rhythm rib ribbon rice rich ride ridge rifle right rigid ring ripple risk ritual rival river road
roast robot robust rocket romance roof rookie room rose rotate rough round route royal rubber rug rule run
runway saddle sadness safe sail salad salmon salon salt salute same sample sand satisfy satoshi sauce
sausage save say scale scan scatter scene scheme school science scout screen script scrub sea search season
seat second secret section seed seek segment select sell seminar senior sense series service session settle
setup seven shadow shaft shallow share shed shell sheriff shield shift shine ship shiver shoe shop short
shove shrimp shrug shuffle shy sibling side siege sight sign silent silk silly silver similar simple since
sing siren sister situate six size skate sketch ski skill skin skirt skull slab sleep slender slice slide
slight slim slot slow slush small smart smile smoke smooth snack snap sniff snow soap soccer social sock
soda soft solar soldier solid solve someone song soon sort soul sound soup source south space spare spatial
spawn speak special speed spell spend sphere spice spider spin spirit split spoil sponsor spoon sport spot
spray spread spring spy square squeeze stable stadium staff stage stairs stamp stand start state stay steak
steel stem step stereo stick still sting stock stone stool story stove street strong student stumble style
subject submit subway success such sudden sugar suggest suit summer sun sunny sunset super supply supreme
sure surface surge survey suspect sustain swallow swamp swap swarm sweet swift swim swing switch symbol
symptom syrup system table tag tail talent talk tank tape target task taste taxi teach team tell ten tennis
tent term test text thank that theme then theory there they thing this thought three throw thumb thunder
ticket tide tiger tilt timber time tiny tip tired tissue title toast today toddler toe toilet token tomato
tone tongue tonight tool tooth top topic topple torch tornado toss total tourist toward tower town toy track
trade traffic tragic train travel tray treat tree trend trial tribe trick trigger trim trip trophy truck
true truly trumpet trust truth try tube tuition tumble tuna tunnel turkey turn turtle twelve twenty twice
twin twist two type typical unable unaware uncle uncover under undo unfold uniform unique unit unknown until
unusual update upgrade uphold upon upper urban urge usage use used useful usual utility vacant vacuum valid
valley valve van vapor various vast vault vehicle velvet vendor venture venue verb verify version very
vessel veteran viable vibrant victory video view village vintage virtual visa visit visual vital vivid vocal
voice void volcano volume voyage wage wagon wait walk wall walnut want warm warrior wash wasp waste water
wave way wealth wear weasel weather web wedding weekend weird welcome west wet whale what wheat wheel when
where whip whisper wide width wife wild will win window wine wing wink winner winter wire wisdom wise wish
wolf woman wonder wood wool word work world worry worth wrap wreck wrestle wrist write yard year yellow you
young youth zebra zone zoo
`.trim().split(/\s+/);
