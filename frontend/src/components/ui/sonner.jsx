import { Toaster as Sonner } from "sonner"

const Toaster = ({
  ...props
}) => {
  // Remove useTheme dependency for React app (not Next.js)
  const theme = "light" // Default theme for React app

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      position="top-right"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-white group-[.toaster]:text-gray-900 group-[.toaster]:border-gray-200 group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-gray-600",
          actionButton:
            "group-[.toast]:bg-blue-600 group-[.toast]:text-white",
          cancelButton:
            "group-[.toast]:bg-gray-100 group-[.toast]:text-gray-900",
        },
        style: {
          zIndex: 9999
        }
      }}
      {...props} />
  );
}

export { Toaster }
