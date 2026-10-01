export default function BrandLogo({ className }) {
  return <img src={`${import.meta.env.BASE_URL}pb-logo.png`} className={className} alt="" width="512" height="512" />;
}
